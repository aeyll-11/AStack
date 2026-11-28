import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findViolations, parseCommitCommand } from "../scripts/commit-guard.ts";
import type { Context } from "../scripts/commit-guard.ts";

const AI = "Co-Authored-By: Claude <noreply@anthropic.com>";
const me = { name: "Ada", email: "ada@example.com" };

function check(command: string, files: Record<string, string> = {}): string[] {
  const cmd = parseCommitCommand(command);
  if (cmd === null) return [];
  const ctx: Context = { identity: me, readFile: (p) => files[p] ?? null };
  return findViolations(cmd, ctx, command);
}

test("-m with a Claude trailer is denied", () => {
  assert.equal(check(`git commit -m "feat: x" -m "${AI}"`).length, 1);
});

test("-F file with a trailer is denied", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-"));
  const f = join(dir, "msg.txt");
  writeFileSync(f, `feat: x\n\n${AI}\n`);
  const cmd = parseCommitCommand(`git commit -F ${f}`);
  assert.ok(cmd);
  const v = findViolations(cmd, { identity: me, readFile: (p) => (p === f ? `feat: x\n\n${AI}\n` : null) });
  assert.equal(v.length, 1);
});

test("human co-author is allowed", () => {
  assert.deepEqual(check(`git commit -m "feat: x" -m "Co-Authored-By: Bo Lee <bo@example.com>"`), []);
});

test("--author mismatch is denied, match is allowed", () => {
  assert.equal(check(`git commit --author="Claude <noreply@anthropic.com>" -m "x"`).length, 1);
  assert.equal(check(`git commit --author "Ada <ada@example.com>" -m "x"`).length, 0);
});

test("git -C dir commit is parsed", () => {
  const cmd = parseCommitCommand(`git -C x commit -m "a"`);
  assert.equal(cmd?.dir, "x");
  assert.equal(check(`git -C x commit -m "${AI}"`).length, 1);
});

test("commit after && and ; is parsed", () => {
  assert.equal(check(`git add . && git commit -m "${AI}"`).length, 1);
  assert.equal(check(`cd r; git commit -am "${AI}"`).length, 1);
});

test("--amend --no-edit is allowed", () => {
  assert.deepEqual(check("git commit --amend --no-edit"), []);
});

test("non-git and non-commit commands are allowed", () => {
  assert.equal(parseCommitCommand("ls -la"), null);
  assert.equal(parseCommitCommand(`echo "git commit"`), null);
  assert.equal(parseCommitCommand("git status"), null);
});

test("heredoc message with a trailer is denied", () => {
  const cmd = `git commit -m "$(cat <<'EOF'\nfeat: x\n\n${AI}\nEOF\n)"`;
  assert.equal(check(cmd).length, 1);
});

test("Generated with Claude Code line is denied", () => {
  assert.equal(check(`git commit -m "x" -m "Generated with [Claude Code](https://claude.com/claude-code)"`).length, 1);
});

test("--trailer with an AI co-author is denied", () => {
  assert.equal(check(`git commit -m x --trailer "Co-authored-by: Copilot <c@github.com>"`).length, 1);
});

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "commit-guard.ts");

function run(stdin: string) {
  return spawnSync("node", [script], { input: stdin, encoding: "utf8" });
}

test("CLI denies with the PreToolUse contract and exits 0", () => {
  const r = run(JSON.stringify({ tool_input: { command: `git commit -m "x" -m "${AI}"` } }));
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };
  assert.equal(j.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(j.hookSpecificOutput.permissionDecision, "deny");
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /commit skill/);
});

test("CLI is silent for clean, non-commit, and malformed input", () => {
  for (const input of [JSON.stringify({ tool_input: { command: 'git commit -m "feat: x"' } }), JSON.stringify({ tool_input: { command: "ls" } }), "not json", ""]) {
    const r = run(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
});
