import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { lintTree } from "../scripts/lint.ts";

const fx = (p: string) => fileURLToPath(new URL(`./fixtures/lint/${p}`, import.meta.url));

test("clean fixture has no issues", () => {
  assert.deepEqual(lintTree(fx("clean")), []);
});

test("cursor-residue flags Cursor but not css cursor", () => {
  const issues = lintTree(fx("dirty/cursor"));
  assert.ok(issues.length >= 2);
  assert.ok(issues.every((i) => i.rule === "cursor-residue"));
  assert.deepEqual(issues.map((i) => i.line).sort(), [6, 8]);
});

test("cast-in-public", () => {
  const issues = lintTree(fx("dirty/cast"));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "cast-in-public");
});

test("merge-ban", () => {
  const issues = lintTree(fx("dirty/merge"));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "merge-ban");
});

test("merge-ban exempts the deny entry only", () => {
  const issues = lintTree(fx("dirty/merge-deny"));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "merge-ban");
  assert.equal(issues[0].line, 7);
});

test("frontmatter", () => {
  const issues = lintTree(fx("dirty/frontmatter"));
  assert.ok(issues.length >= 3);
  assert.ok(issues.every((i) => i.rule === "frontmatter"));
});

test("size", () => {
  const issues = lintTree(fx("dirty/size"));
  assert.equal(issues.length, 2);
  assert.ok(issues.every((i) => i.rule === "size"));
});

test("old-name flags the former plugin name", () => {
  const issues = lintTree(fx("dirty/old-name"));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "old-name");
  assert.equal(issues[0].line, 6);
});
