import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROLES } from "./lib/config.ts";

export interface Doc {
  path: string;
  text: string;
}

const LABEL_SUFFIXES: ReadonlySet<string> = new Set(["in-progress", "needs-info"]);

export function routerPlaybookSlugs(router: string): string[] {
  const slugs: string[] = [];
  let inTable = false;
  for (const line of router.split("\n")) {
    if (/^\|\s*Slug\s*\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    const cell = line.split("|")[1]?.trim() ?? "";
    if (/^[a-z][a-z0-9-]*$/.test(cell)) slugs.push(cell);
  }
  return slugs;
}

export function missingPlaybooks(slugs: readonly string[], files: ReadonlySet<string>): string[] {
  return slugs.filter((s) => !files.has(s));
}

function scan(docs: readonly Doc[], re: RegExp, bad: (m: RegExpExecArray) => boolean, show: (m: RegExpExecArray) => string): string[] {
  const out: string[] = [];
  for (const d of docs) {
    for (const m of d.text.matchAll(re)) if (bad(m)) out.push(`${d.path}: ${show(m)}`);
  }
  return [...new Set(out)];
}

// Bold words that are status labels in prose, not skill references.
const STATUS_WORDS: ReadonlySet<string> = new Set(["escalated", "clean", "changed", "blocked"]);

// `known` is every valid target: skill folders, playbook slugs, agent names.
export function danglingSkillRefs(docs: readonly Doc[], known: ReadonlySet<string>): string[] {
  return scan(docs, /\*\*([a-z][a-z0-9-]*)\*\*/g, (m) => !known.has(m[1] ?? "") && !STATUS_WORDS.has(m[1] ?? ""), (m) => m[0]);
}

export function danglingAgentRefs(docs: readonly Doc[], agents: ReadonlySet<string>, labels: ReadonlySet<string> = LABEL_SUFFIXES): string[] {
  return scan(
    docs,
    /(?<![/\w])resonator:([a-z][a-z0-9-]*)/g,
    (m) => !agents.has(m[1] ?? "") && !labels.has(m[1] ?? ""),
    (m) => m[0],
  );
}

export function unknownModelRoles(docs: readonly Doc[], roles: readonly string[]): string[] {
  const out: string[] = [];
  for (const d of docs) {
    for (const m of d.text.matchAll(/config\.ts model ([a-z][a-z0-9-]*)/g)) {
      if (!roles.includes(m[1] ?? "")) out.push(`${d.path}: ${m[1]}`);
    }
  }
  return [...new Set(out)];
}

// ---- CLI ----

const ROOT = fileURLToPath(new URL("..", import.meta.url));
type Status = "PASS" | "FAIL" | "SKIP";
let failures = 0;
const counts: Record<Status, number> = { PASS: 0, FAIL: 0, SKIP: 0 };

function report(status: Status, name: string, detail = ""): void {
  counts[status]++;
  if (status === "FAIL") failures++;
  console.log(`${status} ${name}${detail ? ` ${detail.replace(/\s+/g, " ").trim()}` : ""}`);
}

function check(name: string, ok: boolean, detail: string): void {
  report(ok ? "PASS" : "FAIL", name, detail);
}

interface Run {
  code: number | null;
  out: string;
  err: string;
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; input?: string } = {}): Run {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    input: opts.input ?? "",
    encoding: "utf8",
    timeout: 120_000,
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const script = (rel: string): string => join(ROOT, "scripts", rel);
const node = (rel: string, args: string[], opts: Parameters<typeof run>[2] = {}): Run => run(process.execPath, [script(rel), ...args], opts);

function tail(r: Run): string {
  return (r.err || r.out).trim().split("\n").slice(-1)[0] ?? "";
}

function toolchain(): void {
  const steps: [string, string, string[]][] = [
    ["npm-test", "npm", ["test"]],
    ["typecheck", "npx", ["tsc", "--noEmit"]],
    ["lint", process.execPath, [script("lint.ts")]],
  ];
  for (const [name, cmd, args] of steps) {
    const r = run(cmd, args);
    check(name, r.code === 0, r.code === 0 ? "" : `exit ${r.code}: ${tail(r)}`);
  }
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8" });
  if (probe.error) {
    report("SKIP", "plugin-validate", "claude binary not found");
    return;
  }
  const r = run("claude", ["plugin", "validate", "."]);
  check("plugin-validate", r.code === 0, r.code === 0 ? "" : `exit ${r.code}: ${tail(r)}`);
}

function smoke(): void {
  const tmp = mkdtempSync(join(tmpdir(), "resonator-verify-"));
  const home = join(tmp, "home");
  mkdirSync(home);
  const env = { HOME: home, USERPROFILE: home };

  const path = node("config.ts", ["path"], { env });
  check("config-path", path.code === 0 && path.out.trim() === join(home, ".claude", "resonator", "config.json"), path.out.trim());
  const model = node("config.ts", ["model", "lead"], { env });
  check("config-model-lead", model.code === 0 && /^\S+ \S+$/.test(model.out.trim()), model.out.trim());
  const badRole = node("config.ts", ["model", "nope"], { env });
  check("config-model-unknown-role", badRole.code !== 0, `exit ${badRole.code}`);

  const expected: Record<string, string[]> = {
    "bun-elysia": ["bun"],
    "mono-nuxt": ["node", "nuxt"],
    "node-npm": ["node"],
    "nuxt-bun": ["bun", "nuxt"],
    "nuxt-pnpm": ["node", "nuxt"],
    plain: [],
  };
  const reposDir = join(ROOT, "tests", "fixtures", "repos");
  for (const name of readdirSync(reposDir)) {
    const r = node("detect.ts", [], { cwd: join(reposDir, name) });
    const want = expected[name];
    let got = "";
    try {
      got = JSON.stringify(JSON.parse(r.out));
    } catch {
      got = `unparseable: ${r.out.trim()}`;
    }
    check(`detect-${name}`, r.code === 0 && want !== undefined && got === JSON.stringify(want), want === undefined ? "no expectation for fixture" : got);
  }

  const ss = node("session-start.ts", [], { env, input: JSON.stringify({ cwd: join(reposDir, "nuxt-bun") }) });
  let ssOk = false;
  try {
    const j = JSON.parse(ss.out) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
    ssOk = j.hookSpecificOutput?.hookEventName === "SessionStart" && (j.hookSpecificOutput.additionalContext ?? "").includes(join("skills", "resonator", "SKILL.md"));
  } catch {
    // stays false
  }
  check("session-start", ss.code === 0 && ssOk, ssOk ? "" : ss.out.trim() || ss.err.trim());

  const repo = join(tmp, "repo");
  mkdirSync(repo);
  const git = (...a: string[]): Run => run("git", a, { cwd: repo });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=v@v", "-c", "user.name=v", "commit", "-q", "--allow-empty", "-m", "init");
  const wenv = { ...env, RESONATOR_SKIP_INSTALL: "1" };
  const create = node("worktree.ts", ["create", "--branch", "resonator/verify", "--slot", "1", "--base", "main"], { cwd: repo, env: wenv });
  let slotPath = "";
  try {
    slotPath = (JSON.parse(create.out) as { path?: string }).path ?? "";
  } catch {
    // stays empty
  }
  check("worktree-create", create.code === 0 && slotPath !== "" && existsSync(slotPath), create.code === 0 ? slotPath : tail(create));
  const remove = node("worktree.ts", ["remove", "--branch", "resonator/verify"], { cwd: repo, env: wenv });
  check("worktree-remove", remove.code === 0 && slotPath !== "" && !existsSync(slotPath), remove.code === 0 ? "" : tail(remove));

  const noGh = { ...env, RESONATOR_GH: join(tmp, "no-such-gh") };
  const issues = node("issues.ts", ["list"], { cwd: repo, env: noGh });
  check("issues-list-no-gh", issues.code === 2 && issues.err.includes("resonator: GitHub unavailable"), `exit ${issues.code}: ${tail(issues)}`);
  const wp = node("watch-pr/cli.ts", ["1", "--once", "--json"], { cwd: repo, env: noGh });
  check("watch-pr-no-gh", wp.code === 2 && wp.err.includes("resonator: GitHub unavailable"), `exit ${wp.code}: ${tail(wp)}`);

  const ev = node("evidence.ts", [], { cwd: repo, env });
  check("evidence-usage", ev.code !== 0 && ev.err.includes("usage: evidence.ts"), `exit ${ev.code}: ${tail(ev)}`);
}

function listMd(dir: string): Doc[] {
  const out: Doc[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push({ path: relative(ROOT, p), text: readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  return out;
}

function structure(): void {
  const names = (dir: string, dirs: boolean): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((e) => (dirs ? e.isDirectory() : e.isFile() && e.name.endsWith(".md")))
      .map((e) => e.name.replace(/\.md$/, ""));
  const docs = [...listMd(join(ROOT, "skills")), ...listMd(join(ROOT, "agents"))];

  const router = readFileSync(join(ROOT, "skills", "resonator", "SKILL.md"), "utf8");
  const slugs = routerPlaybookSlugs(router);
  const missing = missingPlaybooks(slugs, new Set(names("skills/resonator/playbooks", false)));
  check("playbooks", slugs.length > 0 && missing.length === 0, slugs.length === 0 ? "no slugs found" : missing.length ? `missing: ${missing.join(", ")}` : `${slugs.length} slugs`);

  const skills = new Set(names("skills", true));
  const agents = new Set(names("agents", false));
  const known = new Set([...skills, ...agents, ...slugs]);
  const sk = danglingSkillRefs(docs, known);
  check("skill-refs", sk.length === 0, sk.length ? sk.join("; ") : `${skills.size} skills`);

  const ag = danglingAgentRefs(docs, agents);
  check("agent-refs", ag.length === 0, ag.length ? ag.join("; ") : `${agents.size} agents`);

  const roles = unknownModelRoles(docs, ROLES);
  check("model-roles", roles.length === 0, roles.length ? roles.join("; ") : "");
}

export function main(): void {
  toolchain();
  smoke();
  structure();
  console.log(`\n${counts.PASS} pass, ${counts.FAIL} fail, ${counts.SKIP} skip`);
  process.exit(failures > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
