import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
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
  const bare = tmp("resonator-ev-bare-");
  git(bare, "init", "-q", "--bare", "-b", "main");
  const repo = tmp("resonator-ev-repo-");
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
    "https://github.com/o/r/blob/resonator-evidence/pr-12/home page.png?raw=true",
  );
  assert.equal(evidenceUrl(slug, 3, "trace.zip"), "https://github.com/o/r/blob/resonator-evidence/pr-3/trace.zip?raw=true");
});

test("push creates the orphan branch, then appends", () => {
  const { repo, bare } = makeRepoWithRemote();
  const out = tmp("resonator-ev-files-");
  const shot = join(out, "home.png");
  const trace = join(out, "trace.zip");
  writeFileSync(shot, "png");
  writeFileSync(trace, "zip");

  const first = pushEvidence({ cwd: repo, pr: 7, files: [shot, trace], slug });
  assert.deepEqual(first, [
    "![home.png](https://github.com/o/r/blob/resonator-evidence/pr-7/home.png?raw=true)",
    "[trace.zip](https://github.com/o/r/blob/resonator-evidence/pr-7/trace.zip?raw=true)",
  ]);
  assert.equal(git(bare, "ls-tree", "-r", "--name-only", "resonator-evidence"), "pr-7/home.png\npr-7/trace.zip");
  assert.equal(git(bare, "rev-list", "--count", "resonator-evidence"), "1");

  const second = join(out, "after.jpg");
  writeFileSync(second, "jpg");
  pushEvidence({ cwd: repo, pr: 8, files: [second], slug });
  assert.equal(
    git(bare, "ls-tree", "-r", "--name-only", "resonator-evidence"),
    "pr-7/home.png\npr-7/trace.zip\npr-8/after.jpg",
  );
  assert.equal(git(bare, "rev-list", "--count", "resonator-evidence"), "2");

  const mb = spawnSync("git", ["merge-base", "main", "resonator-evidence"], { cwd: bare });
  assert.equal(mb.status, 1, "resonator-evidence shares no ancestor with main");
  assert.equal(git(repo, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.equal(git(repo, "worktree", "list").split("\n").length, 1, "temp worktree removed");
  assert.equal(git(repo, "branch", "--list", "resonator-evidence"), "", "no local evidence branch");
});

test("push succeeds when a stale local resonator-evidence branch exists", () => {
  const { repo, bare } = makeRepoWithRemote();
  git(repo, "branch", "resonator-evidence");
  const f = join(tmp("resonator-ev-files-"), "shot.png");
  writeFileSync(f, "png");
  pushEvidence({ cwd: repo, pr: 4, files: [f], slug });
  assert.equal(git(bare, "ls-tree", "-r", "--name-only", "resonator-evidence"), "pr-4/shot.png");
  assert.equal(git(bare, "rev-list", "--count", "resonator-evidence"), "1");
  assert.equal(spawnSync("git", ["merge-base", "main", "resonator-evidence"], { cwd: bare }).status, 1);
});

test("push retries when the remote moves between fetch and push", () => {
  const { repo, bare } = makeRepoWithRemote();
  const files = tmp("resonator-ev-files-");
  const first = join(files, "a.png");
  writeFileSync(first, "a");
  pushEvidence({ cwd: repo, pr: 1, files: [first], slug });

  const rival = tmp("resonator-ev-rival-");
  git(rival, "clone", "-q", "-b", "resonator-evidence", bare, ".");
  git(rival, "config", "user.email", "r@r");
  git(rival, "config", "user.name", "r");
  writeFileSync(join(rival, "rival.txt"), "rival");
  git(rival, "add", "rival.txt");
  git(rival, "commit", "-q", "-m", "rival");

  const marker = join(files, "raced");
  const hook = join(repo, ".git", "hooks", "pre-push");
  writeFileSync(
    hook,
    `#!/bin/sh\n[ -e "${marker}" ] && exit 0\ntouch "${marker}"\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ngit -C "${rival}" push -q origin HEAD:refs/heads/resonator-evidence\n`,
  );
  chmodSync(hook, 0o755);

  const second = join(files, "b.png");
  writeFileSync(second, "b");
  pushEvidence({ cwd: repo, pr: 2, files: [second], slug });
  assert.equal(
    git(bare, "ls-tree", "-r", "--name-only", "resonator-evidence"),
    "pr-1/a.png\npr-2/b.png\nrival.txt",
  );
  assert.equal(git(bare, "rev-list", "--count", "resonator-evidence"), "3");
});

test("CLI exits 2 when origin is not GitHub", () => {
  const { repo } = makeRepoWithRemote();
  const f = join(repo, "x.png");
  writeFileSync(f, "x");
  const script = join(import.meta.dirname, "..", "scripts", "evidence.ts");
  const r = spawnSync(process.execPath, [script, "push", "--pr", "1", f], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /resonator: GitHub unavailable/);
});
