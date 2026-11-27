import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evidenceUrl, pushEvidence } from "../scripts/evidence.ts";

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(d);
  return d;
}
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
function makeRepoWithRemote(): { repo: string; bare: string } {
  const bare = tmp("astack-ev-bare-");
  git(bare, "init", "-q", "--bare", "-b", "main");
  const repo = tmp("astack-ev-repo-");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "app.txt"), "app\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "remote", "add", "origin", bare);
  git(repo, "push", "-q", "origin", "main");
  return { repo, bare };
}
const slug = { owner: "o", repo: "r" };

test("evidenceUrl builds the raw blob URL from the basename", () => {
  assert.equal(
    evidenceUrl(slug, 12, "/tmp/out/home page.png"),
    "https://github.com/o/r/blob/astack-evidence/pr-12/home page.png?raw=true",
  );
  assert.equal(evidenceUrl(slug, 3, "trace.zip"), "https://github.com/o/r/blob/astack-evidence/pr-3/trace.zip?raw=true");
});

test("push creates the orphan branch, then appends", () => {
  const { repo, bare } = makeRepoWithRemote();
  const out = tmp("astack-ev-files-");
  const shot = join(out, "home.png");
  const trace = join(out, "trace.zip");
  writeFileSync(shot, "png");
  writeFileSync(trace, "zip");

  const first = pushEvidence({ cwd: repo, pr: 7, files: [shot, trace], slug });
  assert.deepEqual(first, [
    "![home.png](https://github.com/o/r/blob/astack-evidence/pr-7/home.png?raw=true)",
    "[trace.zip](https://github.com/o/r/blob/astack-evidence/pr-7/trace.zip?raw=true)",
  ]);
  assert.equal(git(bare, "ls-tree", "-r", "--name-only", "astack-evidence"), "pr-7/home.png\npr-7/trace.zip");
  assert.equal(git(bare, "rev-list", "--count", "astack-evidence"), "1");

  const second = join(out, "after.jpg");
  writeFileSync(second, "jpg");
  pushEvidence({ cwd: repo, pr: 8, files: [second], slug });
  assert.equal(
    git(bare, "ls-tree", "-r", "--name-only", "astack-evidence"),
    "pr-7/home.png\npr-7/trace.zip\npr-8/after.jpg",
  );
  assert.equal(git(bare, "rev-list", "--count", "astack-evidence"), "2");

  const mb = spawnSync("git", ["merge-base", "main", "astack-evidence"], { cwd: bare });
  assert.equal(mb.status, 1, "astack-evidence shares no ancestor with main");
  assert.equal(git(repo, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.equal(git(repo, "worktree", "list").split("\n").length, 1, "temp worktree removed");
});

test("CLI exits 2 when origin is not GitHub", () => {
  const { repo } = makeRepoWithRemote();
  const f = join(repo, "x.png");
  writeFileSync(f, "x");
  const script = join(import.meta.dirname, "..", "scripts", "evidence.ts");
  const r = spawnSync(process.execPath, [script, "push", "--pr", "1", f], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /astack: GitHub unavailable/);
});
