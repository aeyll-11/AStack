import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubUnavailable, repoSlug, run } from "../scripts/lib/git.ts";
import { createSlot, freePort, removeSlot } from "../scripts/worktree.ts";

process.env.RESONATOR_SKIP_INSTALL = "1";

const dirs: string[] = [];
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
}
function makeRepo(withEnv: boolean): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "resonator-wt-")));
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
  process.env.RESONATOR_SKIP_INSTALL = "1";
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
    assert.match((e as Error).message, /^resonator: GitHub unavailable: /);
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

test("--base off a remote branch does not track it", async () => {
  const repo = makeRepo(false);
  git(repo, "remote", "add", "origin", repo);
  git(repo, "fetch", "-q", "origin");
  const slot = await createSlot({ repoRoot: repo, branch: "resonator/feat", slot: 0, basePort: 3100, base: "origin/main" });
  assert.ok(existsSync(join(slot.path, "a.txt")));
  assert.throws(() => git(repo, "config", "--get", "branch.resonator/feat.remote"));
});

test("copies an untracked .resonator/config.json and never overwrites", async () => {
  const repo = makeRepo(false);
  mkdirSync(join(repo, ".resonator"));
  writeFileSync(join(repo, ".resonator", "config.json"), '{"concurrency":2}\n');
  const slot = await createSlot({ repoRoot: repo, branch: "cfg", slot: 0, basePort: 3100 });
  const dest = join(slot.path, ".resonator", "config.json");
  assert.equal(readFileSync(dest, "utf8"), '{"concurrency":2}\n');
  assert.equal(slot.resonatorConfig, true);
  writeFileSync(dest, '{"concurrency":5}\n');
  await createSlot({ repoRoot: repo, branch: "cfg", slot: 0, basePort: 3100 });
  assert.equal(readFileSync(dest, "utf8"), '{"concurrency":5}\n');
});

test("a tracked .resonator/config.json is left to git", async () => {
  const repo = makeRepo(false);
  mkdirSync(join(repo, ".resonator"));
  writeFileSync(join(repo, ".resonator", "config.json"), "{}\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "cfg");
  writeFileSync(join(repo, ".resonator", "config.json"), '{"dirty":1}\n');
  const slot = await createSlot({ repoRoot: repo, branch: "tracked", slot: 0, basePort: 3100 });
  assert.equal(slot.resonatorConfig, false);
  assert.equal(readFileSync(join(slot.path, ".resonator", "config.json"), "utf8"), "{}\n");
});

test("no .resonator/config.json reports resonatorConfig false", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "nocfg", slot: 0, basePort: 3100 });
  assert.equal(slot.resonatorConfig, false);
});

test("copies untracked .claude/skills/verify-* dirs into a new slot and never overwrites", async () => {
  const repo = makeRepo(false);
  const skill = join(repo, ".claude", "skills", "verify-notes");
  mkdirSync(join(skill, "scripts"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "root\n");
  writeFileSync(join(skill, "scripts", "notes-cli.mjs"), "cli\n");
  mkdirSync(join(repo, ".claude", "skills", "other"), { recursive: true });
  writeFileSync(join(repo, ".claude", "skills", "other", "SKILL.md"), "x\n");
  const slot = await createSlot({ repoRoot: repo, branch: "vs", slot: 0, basePort: 3100 });
  const dest = join(slot.path, ".claude", "skills", "verify-notes");
  assert.deepEqual(slot.verifySkills, ["verify-notes"]);
  assert.equal(readFileSync(join(dest, "scripts", "notes-cli.mjs"), "utf8"), "cli\n");
  assert.equal(existsSync(join(slot.path, ".claude", "skills", "other")), false);
  writeFileSync(join(dest, "SKILL.md"), "slot edit\n");
  await createSlot({ repoRoot: repo, branch: "vs", slot: 0, basePort: 3100 });
  assert.equal(readFileSync(join(dest, "SKILL.md"), "utf8"), "slot edit\n");
});

test("a tracked verify skill is left to git", async () => {
  const repo = makeRepo(false);
  const skill = join(repo, ".claude", "skills", "verify-notes");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "committed\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "skill");
  writeFileSync(join(skill, "SKILL.md"), "dirty\n");
  const slot = await createSlot({ repoRoot: repo, branch: "vs-tracked", slot: 0, basePort: 3100 });
  assert.deepEqual(slot.verifySkills, []);
  assert.equal(readFileSync(join(slot.path, ".claude", "skills", "verify-notes", "SKILL.md"), "utf8"), "committed\n");
});

test("removeSlot refuses a slot with uncommitted edits and leaves it in place", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "dirty/edit", slot: 0, basePort: 3100 });
  writeFileSync(join(slot.path, "a.txt"), "changed\n");
  assert.throws(() => removeSlot(repo, "dirty/edit"), /uncommitted changes:\n M a\.txt[\s\S]*--force/);
  assert.equal(readFileSync(join(slot.path, "a.txt"), "utf8"), "changed\n");
});

test("removeSlot refuses a slot with a new untracked file", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "dirty-new", slot: 0, basePort: 3100 });
  writeFileSync(join(slot.path, "notes.md"), "draft\n");
  assert.throws(() => removeSlot(repo, "dirty-new"), /notes\.md/);
  assert.ok(existsSync(join(slot.path, "notes.md")));
});

test("removeSlot with force removes a dirty slot", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "dirty-force", slot: 0, basePort: 3100 });
  writeFileSync(join(slot.path, "a.txt"), "changed\n");
  removeSlot(repo, "dirty-force", { force: true });
  assert.ok(!existsSync(slot.path));
});

test("removeSlot treats files createSlot copied in, unchanged, as clean", async () => {
  const repo = makeRepo(true);
  mkdirSync(join(repo, ".resonator"));
  writeFileSync(join(repo, ".resonator", "config.json"), "{}\n");
  mkdirSync(join(repo, ".claude", "skills", "verify-notes"), { recursive: true });
  writeFileSync(join(repo, ".claude", "skills", "verify-notes", "SKILL.md"), "root\n");
  const slot = await createSlot({ repoRoot: repo, branch: "seeded", slot: 0, basePort: 3100 });
  removeSlot(repo, "seeded");
  assert.ok(!existsSync(slot.path));
  const edited = await createSlot({ repoRoot: repo, branch: "seeded-edit", slot: 0, basePort: 3100 });
  writeFileSync(join(edited.path, ".claude", "skills", "verify-notes", "SKILL.md"), "slot edit\n");
  assert.throws(() => removeSlot(repo, "seeded-edit"), /verify-notes\/SKILL\.md/);
});

test("worktree.ts remove needs --force for a dirty slot", async () => {
  const repo = makeRepo(false);
  const slot = await createSlot({ repoRoot: repo, branch: "cli-dirty", slot: 0, basePort: 3100 });
  writeFileSync(join(slot.path, "a.txt"), "changed\n");
  const cli = join(import.meta.dirname, "..", "scripts", "worktree.ts");
  const refused = spawnSync(process.execPath, [cli, "remove", "--branch", "cli-dirty"], { cwd: repo, encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /uncommitted changes/);
  assert.ok(existsSync(slot.path));
  const forced = spawnSync(process.execPath, [cli, "remove", "--branch", "cli-dirty", "--force"], { cwd: repo, encoding: "utf8" });
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!existsSync(slot.path));
});
