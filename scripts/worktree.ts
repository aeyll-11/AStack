import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./lib/config.ts";
import { GitHubUnavailable, run } from "./lib/git.ts";

export interface Slot {
  branch: string;
  path: string;
  port: number;
  envFiles: string[];
  resonatorConfig: boolean;
  verifySkills: string[];
  installed: boolean;
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

export async function freePort(start: number, isFree: (p: number) => Promise<boolean> = portIsFree): Promise<number> {
  for (let p = start; p < start + 50; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(`resonator: no free port in ${start}-${start + 49}`);
}

function isIgnored(cwd: string, file: string): boolean {
  try {
    run("git", ["check-ignore", "-q", file], cwd);
    return true;
  } catch {
    return false;
  }
}

function ensureExcluded(repoRoot: string): void {
  if (isIgnored(repoRoot, ".worktrees")) return;
  const gitDir = run("git", ["rev-parse", "--git-common-dir"], repoRoot);
  const infoDir = resolve(repoRoot, gitDir, "info");
  mkdirSync(infoDir, { recursive: true });
  const file = join(infoDir, "exclude");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  appendFileSync(file, `${cur === "" || cur.endsWith("\n") ? "" : "\n"}.worktrees/\n`);
}

function copyEnvFiles(repoRoot: string, wt: string): string[] {
  const copied: string[] = [];
  for (const ent of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.startsWith(".env")) continue;
    if (!isIgnored(repoRoot, ent.name)) continue;
    const dest = join(wt, ent.name);
    if (!existsSync(dest)) copyFileSync(join(repoRoot, ent.name), dest);
    copied.push(ent.name);
  }
  return copied.sort();
}

function isTracked(cwd: string, file: string): boolean {
  try {
    run("git", ["ls-files", "--error-unmatch", file], cwd);
    return true;
  } catch {
    return false;
  }
}

function copyProjectConfig(repoRoot: string, wt: string): boolean {
  const rel = join(".resonator", "config.json");
  const src = join(repoRoot, rel);
  if (!existsSync(src) || isTracked(repoRoot, rel)) return false;
  const dest = join(wt, rel);
  if (!existsSync(dest)) {
    mkdirSync(join(wt, ".resonator"), { recursive: true });
    copyFileSync(src, dest);
  }
  return true;
}

// Untracked project verify skills (.claude/skills/verify-*) follow the repo into each slot. Tracked ones come with git.
function copyVerifySkills(repoRoot: string, wt: string): string[] {
  const dir = join(".claude", "skills");
  if (!existsSync(join(repoRoot, dir))) return [];
  const copied: string[] = [];
  for (const ent of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith("verify-")) continue;
    const rel = join(dir, ent.name);
    if (run("git", ["ls-files", "--", rel], repoRoot).trim()) continue;
    const dest = join(wt, rel);
    if (!existsSync(dest)) cpSync(join(repoRoot, rel), dest, { recursive: true });
    copied.push(ent.name);
  }
  return copied.sort();
}

function installCommand(wt: string): [string, string[]] | null {
  const has = (f: string) => existsSync(join(wt, f));
  if (has("bun.lock") || has("bun.lockb")) return ["bun", ["install"]];
  if (has("pnpm-lock.yaml")) return ["pnpm", ["i", "--frozen-lockfile"]];
  if (has("yarn.lock")) return ["yarn", ["install", "--immutable"]];
  if (has("package-lock.json")) return ["npm", ["ci"]];
  return null;
}

function branchExists(repoRoot: string, branch: string): boolean {
  try {
    run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

function isRegistered(repoRoot: string, path: string): boolean {
  const out = run("git", ["worktree", "list", "--porcelain"], repoRoot);
  return out.split("\n").some((l) => l === `worktree ${path}`);
}

export async function createSlot(opts: {
  repoRoot: string;
  branch: string;
  slot: number;
  basePort: number;
  base?: string;
}): Promise<Slot> {
  const { repoRoot, branch } = opts;
  const path = join(repoRoot, ".worktrees", branch.replaceAll("/", "-"));
  const port = await freePort(opts.basePort + opts.slot);
  let installed = false;

  if (existsSync(path) && isRegistered(repoRoot, path)) {
    return {
      branch,
      path,
      port,
      envFiles: copyEnvFiles(repoRoot, path),
      resonatorConfig: copyProjectConfig(repoRoot, path),
      verifySkills: copyVerifySkills(repoRoot, path),
      installed,
    };
  }

  ensureExcluded(repoRoot);
  if (branchExists(repoRoot, branch)) {
    run("git", ["worktree", "add", path, branch], repoRoot);
  } else {
    const from = opts.base ? ["--no-track", "-b", branch, path, opts.base] : ["-b", branch, path, "HEAD"];
    run("git", ["worktree", "add", ...from], repoRoot);
  }
  const envFiles = copyEnvFiles(repoRoot, path);
  const resonatorConfig = copyProjectConfig(repoRoot, path);
  const verifySkills = copyVerifySkills(repoRoot, path);
  const install = process.env.RESONATOR_SKIP_INSTALL === "1" ? null : installCommand(path);
  if (install) {
    run(install[0], install[1], path);
    installed = true;
  }
  return { branch, path, port, envFiles, resonatorConfig, verifySkills, installed };
}

function sameFile(a: string, b: string): boolean {
  return existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
}

export function uncommitted(repoRoot: string, path: string): string[] {
  const out = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd: path, encoding: "utf8" });
  const entries = out.split("\0").filter(Boolean);
  const dirty: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e[0] === "R" || e[0] === "C") i++;
    const file = e.slice(3);
    if (e.startsWith("??") && sameFile(join(path, file), join(repoRoot, file))) continue;
    dirty.push(e);
  }
  return dirty;
}

export function removeSlot(repoRoot: string, branch: string, opts: { force?: boolean } = {}): void {
  const path = join(repoRoot, ".worktrees", branch.replaceAll("/", "-"));
  if (!opts.force && existsSync(path)) {
    const dirty = uncommitted(repoRoot, path);
    if (dirty.length) {
      throw new Error(`resonator: slot ${path} has uncommitted changes:\n${dirty.join("\n")}\nCommit them, or pass --force to discard them.`);
    }
  }
  run("git", ["worktree", "remove", "--force", path], repoRoot);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  try {
    const cwd = process.cwd();
    const repoRoot = run("git", ["rev-parse", "--show-toplevel"], cwd);
    const branch = flag(rest, "--branch");
    if (!branch) throw new Error("usage: worktree.ts create --branch <b> --slot <n> [--base origin/main] | remove --branch <b> [--force]");
    if (cmd === "create") {
      const slot = Number(flag(rest, "--slot") ?? "0");
      if (!Number.isInteger(slot) || slot < 0) throw new Error("--slot must be a non-negative integer");
      const cfg = loadConfig({ home: homedir(), cwd: repoRoot });
      const basePort = cfg.devServer?.basePort ?? 3100;
      const result = await createSlot({ repoRoot, branch, slot, basePort, base: flag(rest, "--base") });
      process.stdout.write(JSON.stringify(result) + "\n");
    } else if (cmd === "remove") {
      removeSlot(repoRoot, branch, { force: rest.includes("--force") });
      process.stdout.write(JSON.stringify({ removed: branch }) + "\n");
    } else {
      throw new Error("usage: worktree.ts create --branch <b> --slot <n> [--base origin/main] | remove --branch <b> [--force]");
    }
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(e instanceof GitHubUnavailable ? 2 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
