import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubUnavailable, repoSlug, run } from "../scripts/lib/git.ts";
import { createSlot, freePort, removeSlot } from "../scripts/worktree.ts";

process.env.ASTACK_SKIP_INSTALL = "1";

const dirs: string[] = [];
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
}
function makeRepo(withEnv: boolean): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "astack-wt-")));
  dirs.push(d);
  git(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, ".gitignore"), ".env\n");
  writeFileSync(join(d, ".env.example"), "A=1\n");
  writeFileSync(join(d, "a.txt"), "x\n");
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", "init");
  if (withEnv) writeFileSync(join(d, ".env"), "SECRET=1\n");
  return d;
}
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
before(() => {
  process.env.ASTACK_SKIP_INSTALL = "1";
});

test("copies ignored .env but not tracked .env.example", async () => {
  const repo = makeRepo(true);
  const slot = await createSlot({ repoRoot: repo, branch: "feat/x", slot: 1, basePort: 3100 });
  assert.equal(slot.path, join(repo, ".worktrees", "feat-x"));
  assert.deepEqual(slot.envFiles, [".env"]);
  assert.ok(existsSync(join(slot.path, ".env")));
  assert.equal(slot.installed, false);
  assert.ok(slot.port >= 3101);
  assert.match(git(repo, "branch", "--list", "feat/x"), /feat\/x/);
  assert.match(readFileSafe(join(repo, ".git", "info", "exclude")), /\.worktrees/);
  removeSlot(repo, "feat/x");
  assert.ok(!existsSync(slot.path));
  assert.match(git(repo, "branch", "--list", "feat/x"), /feat\/x/);
});

function readFileSafe(p: string): string {
  return existsSync(p) ? execFileSync("cat", [p], { encoding: "utf8" }) : "";
}

test("no env files gives empty envFiles", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "b1", slot: 0, basePort: 3100 });
  assert.deepEqual(slot.envFiles, []);
});

test("freePort counts upward", async () => {
  assert.equal(await freePort(3101, async (p) => p !== 3101), 3102);
  await assert.rejects(freePort(3000, async () => false));
});

test("createSlot is idempotent", async () => {
  const repo = makeRepo(true);
  const a = await createSlot({ repoRoot: repo, branch: "feat/y", slot: 2, basePort: 3100 });
  const b = await createSlot({ repoRoot: repo, branch: "feat/y", slot: 2, basePort: 3100 });
  assert.equal(a.path, b.path);
  assert.deepEqual(b.envFiles, [".env"]);
});

test("attaches an existing branch", async () => {
  const repo = makeRepo(false);
  git(repo, "branch", "existing");
  const slot = await createSlot({ repoRoot: repo, branch: "existing", slot: 0, basePort: 3100 });
  assert.ok(existsSync(join(slot.path, "a.txt")));
});

test("repoSlug without remote throws GitHubUnavailable", () => {
  const repo = makeRepo(false);
  assert.throws(() => repoSlug(repo), GitHubUnavailable);
  try {
    repoSlug(repo);
  } catch (e) {
    assert.match((e as Error).message, /^astack: GitHub unavailable: /);
  }
});

test("repoSlug parses ssh and https remotes; rejects non-github", () => {
  const repo = makeRepo(false);
  git(repo, "remote", "add", "origin", "git@github.com:o/r.git");
  assert.deepEqual(repoSlug(repo), { owner: "o", repo: "r" });
  git(repo, "remote", "set-url", "origin", "https://github.com/o2/r2");
  assert.deepEqual(repoSlug(repo), { owner: "o2", repo: "r2" });
  git(repo, "remote", "set-url", "origin", "https://github.com/o2/r2.git");
  assert.deepEqual(repoSlug(repo), { owner: "o2", repo: "r2" });
  git(repo, "remote", "set-url", "origin", "https://gitlab.com/o/r.git");
  assert.throws(() => repoSlug(repo), GitHubUnavailable);
});

test("run throws with command and stderr", () => {
  assert.throws(() => run("git", ["nope-not-a-command"], tmpdir()), /git nope-not-a-command/);
});

test("exclude is written to the main repo when repoRoot is a linked worktree", async () => {
  const repo = makeRepo(false);
  const first = await createSlot({ repoRoot: repo, branch: "outer", slot: 0, basePort: 3100 });
  const exclude = join(repo, ".git", "info", "exclude");
  writeFileSync(exclude, "");
  const inner = await createSlot({ repoRoot: first.path, branch: "inner", slot: 1, basePort: 3100 });
  assert.match(readFileSafe(exclude), /\.worktrees\//);
  assert.ok(existsSync(inner.path));
  assert.ok(!existsSync(join(first.path, repo.slice(1))), "no stray absolute-path tree");
});
