import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./lib/config.ts";
import type { AStackConfig } from "./lib/config.ts";
import { GitHubUnavailable, ghBin, repoSlug, run } from "./lib/git.ts";

export interface Issue {
  source: "github" | "linear";
  id: string;
  number?: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
}

export type ClaimResult = "claimed" | "skipped";
export interface Claim {
  result: ClaimResult;
  reason?: string;
}

export const IN_PROGRESS = "astack:in-progress";
const AUTH_RE = /gh auth login|not logged in|authentication required|bad credentials|HTTP 401/i;

function gh(args: string[], cwd: string): string {
  const bin = ghBin();
  try {
    return execFileSync(bin, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const err = e as { code?: string; stderr?: Buffer | string; message?: string };
    if (err.code === "ENOENT") throw new GitHubUnavailable(`gh not found (${bin})`);
    const stderr = String(err.stderr ?? "").trim();
    if (AUTH_RE.test(stderr)) throw new GitHubUnavailable(`gh is not authenticated: ${stderr.split("\n")[0]}`);
    throw new Error(`gh ${args.join(" ")} failed: ${stderr || err.message || "unknown error"}`);
  }
}

export function buildGhListArgs(f: NonNullable<AStackConfig["issues"]>): string[] {
  const args = ["issue", "list", "--state", "open", "--json", "number,title,body,url,labels,assignees"];
  for (const l of f.labels ?? []) args.push("--label", l);
  if (f.assignee) args.push("--assignee", f.assignee);
  if (f.milestone) args.push("--milestone", f.milestone);
  args.push("--limit", "50");
  return args;
}

interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  url: string;
  labels: { name: string }[];
}

export function parseGhIssues(json: string): Issue[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error("astack: gh issue list did not return an array");
  return (raw as GhIssue[]).map((i) => ({
    source: "github",
    id: String(i.number),
    number: i.number,
    title: i.title,
    body: i.body ?? "",
    url: i.url,
    labels: (i.labels ?? []).map((l) => l.name),
  }));
}

export function listIssues(filter: NonNullable<AStackConfig["issues"]>, cwd: string): Issue[] {
  return parseGhIssues(gh(buildGhListArgs(filter), cwd)).filter((i) => !i.labels.includes(IN_PROGRESS));
}

export function claim(n: number, cwd: string): Claim {
  const view = JSON.parse(gh(["issue", "view", String(n), "--json", "state,assignees,labels"], cwd)) as {
    state: string;
    assignees: { login: string }[];
  };
  if (view.state !== "OPEN") return { result: "skipped", reason: view.state.toLowerCase() };
  const me = gh(["api", "user", "--jq", ".login"], cwd);
  const other = view.assignees.find((a) => a.login !== me);
  if (other) return { result: "skipped", reason: `assigned to ${other.login}` };

  const edit = ["issue", "edit", String(n), "--add-assignee", "@me", "--add-label", IN_PROGRESS];
  try {
    gh(edit, cwd);
  } catch (e) {
    if (e instanceof GitHubUnavailable || !/not found/i.test((e as Error).message)) throw e;
    gh(["label", "create", IN_PROGRESS, "--force", "--color", "fbca04", "--description", "An AStack agent is working on this issue"], cwd);
    gh(edit, cwd);
  }
  return { result: "claimed" };
}

export function release(n: number, cwd: string): void {
  gh(["issue", "edit", String(n), "--remove-label", IN_PROGRESS, "--remove-assignee", "@me"], cwd);
}

export function comment(n: number, body: string[], cwd: string): void {
  const args = body[0] === "--body-file" ? ["--body-file", body[1]] : ["--body", body.join(" ")];
  gh(["issue", "comment", String(n), ...args], cwd);
}

const USAGE = "usage: issues.ts list | claim <n> | comment <n> <text> | comment <n> --body-file <f> | release <n>";

function issueNumber(arg: string | undefined): number {
  const n = Number(arg);
  if (!Number.isInteger(n) || n <= 0) throw new Error(USAGE);
  return n;
}

export function main(argv: string[]): void {
  const [cmd, arg, ...rest] = argv;
  try {
    const cwd = run("git", ["rev-parse", "--show-toplevel"], process.cwd());
    repoSlug(cwd);
    const out = (v: unknown) => process.stdout.write(JSON.stringify(v) + "\n");
    if (cmd === "list") {
      const filter = loadConfig({ home: homedir(), cwd }).issues ?? { source: "github" };
      if (filter.source !== "github") throw new Error(`astack: issues.source is ${filter.source}; this script reads GitHub only`);
      out(listIssues(filter, cwd));
    } else if (cmd === "claim") {
      const n = issueNumber(arg);
      out({ issue: n, ...claim(n, cwd) });
    } else if (cmd === "comment" && rest.length > 0) {
      const n = issueNumber(arg);
      comment(n, rest, cwd);
      out({ issue: n, commented: true });
    } else if (cmd === "release") {
      const n = issueNumber(arg);
      release(n, cwd);
      out({ issue: n, released: true });
    } else {
      throw new Error(USAGE);
    }
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(e instanceof GitHubUnavailable ? 2 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
