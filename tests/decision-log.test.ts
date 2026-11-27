import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecision, cleanCell, HEADER } from "../scripts/decision-log.ts";

test("cleanCell flattens tabs and newlines and quotes formula-leading cells", () => {
  assert.equal(cleanCell("a\tb\nc\rd"), "a b c d");
  assert.equal(cleanCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(cleanCell("+1"), "'+1");
  assert.equal(cleanCell("-x"), "'-x");
  assert.equal(cleanCell("@me"), "'@me");
  assert.equal(cleanCell("plain"), "plain");
});

test("appendDecision writes the header once, creates dirs, and stamps ts", () => {
  const dir = mkdtempSync(join(tmpdir(), "decision-log-"));
  const file = join(dir, "nested", "decisions.tsv");
  const now = new Date("2026-05-24T09:02:00.123Z");
  appendDecision({ file, cells: ["frame", "counted", "size first", "commit 3a9f1c2", "ok"], now });
  appendDecision({ file, cells: ["harness", "a\tb", "why", "-", "=x"], now });
  const lines = readFileSync(file, "utf8").split("\n");
  assert.equal(lines[0], HEADER);
  assert.equal(lines[1], "2026-05-24T09:02:00Z\tframe\tcounted\tsize first\tcommit 3a9f1c2\tok");
  assert.equal(lines[2], "2026-05-24T09:02:00Z\tharness\ta b\twhy\t'-\t'=x");
  assert.equal(lines[3], "");
  assert.equal(lines.length, 4);
});

test("appendDecision rejects the wrong cell count", () => {
  const dir = mkdtempSync(join(tmpdir(), "decision-log-"));
  assert.throws(() => appendDecision({ file: join(dir, "d.tsv"), cells: ["a", "b"], now: new Date() }), /5 cells/);
});
