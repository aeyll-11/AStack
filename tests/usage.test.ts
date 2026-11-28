import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregate, buildRows, filterTurns, parseArgs, parseTranscript, parseLine, projectSlug, renderMarkdown, totalsRow } from "../scripts/dev/usage.ts";

function line(o: { id: string; ts: string; model?: string; block?: string; i?: number; o?: number; cw?: number; cr?: number; tool?: string }): string {
  const content = o.block === "tool_use" ? [{ type: "tool_use", id: o.tool ?? "toolu_1", name: "Bash", input: {} }] : [{ type: "thinking", thinking: "" }];
  return JSON.stringify({
    type: "assistant",
    uuid: `u-${o.id}-${o.block ?? "x"}`,
    timestamp: o.ts,
    message: {
      id: o.id,
      model: o.model ?? "claude-opus-5-5",
      role: "assistant",
      content,
      usage: { input_tokens: o.i ?? 2, output_tokens: o.o ?? 100, cache_creation_input_tokens: o.cw ?? 1000, cache_read_input_tokens: o.cr ?? 5000 },
    },
  });
}

const user = JSON.stringify({ type: "user", timestamp: "2026-11-27T07:00:00.000Z", message: { role: "user", content: "hi" } });

test("parseLine ignores non-assistant, malformed and synthetic lines", () => {
  assert.equal(parseLine(user), null);
  assert.equal(parseLine("{nope"), null);
  assert.equal(parseLine(line({ id: "m", ts: "2026-11-27T07:00:00.000Z", model: "<synthetic>" })), null);
});

test("parseLine reads usage, model and tool_use ids", () => {
  const t = parseLine(line({ id: "m1", ts: "2026-11-27T07:00:00.000Z", block: "tool_use", tool: "toolu_a" }));
  assert.deepEqual(t, { id: "m1", model: "claude-opus-5-5", ts: "2026-11-27T07:00:00.000Z", input: 2, output: 100, cacheWrite: 1000, cacheRead: 5000, toolIds: ["toolu_a"] });
});

test("parseTranscript merges multi-block lines sharing message.id", () => {
  const text = [
    user,
    line({ id: "m1", ts: "2026-11-27T07:00:01.000Z" }),
    line({ id: "m1", ts: "2026-11-27T07:00:02.000Z", block: "tool_use", tool: "toolu_a" }),
    line({ id: "m2", ts: "2026-11-27T07:00:05.000Z" }),
  ].join("\n");
  const turns = parseTranscript(text);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]!.toolIds.length, 1);
  assert.equal(turns[0]!.output, 100);
});

test("filterTurns applies inclusive since/until", () => {
  const turns = parseTranscript(["07:00:00", "07:10:00", "07:20:00"].map((h, i) => line({ id: `m${i}`, ts: `2026-11-27T${h}.000Z` })).join("\n"));
  assert.equal(filterTurns(turns, "2026-11-27T07:05:00Z").length, 2);
  assert.equal(filterTurns(turns, undefined, "2026-11-27T07:10:00Z").length, 2);
  assert.equal(filterTurns(turns, "2026-11-27T07:05:00Z", "2026-11-27T07:15:00Z").length, 1);
});

test("aggregate sums tokens, counts turns/tools, computes wall time", () => {
  const turns = parseTranscript([
    line({ id: "m1", ts: "2026-11-27T07:00:00.000Z", i: 1, o: 10, cw: 100, cr: 1000 }),
    line({ id: "m1", ts: "2026-11-27T07:00:00.500Z", block: "tool_use", i: 1, o: 10, cw: 100, cr: 1000 }),
    line({ id: "m2", ts: "2026-11-27T07:01:30.000Z", model: "claude-haiku-5", i: 2, o: 20, cw: 0, cr: 2000 }),
  ].join("\n"));
  const r = aggregate("main", turns);
  assert.equal(r.input, 3);
  assert.equal(r.output, 30);
  assert.equal(r.cacheWrite, 100);
  assert.equal(r.cacheRead, 3000);
  assert.equal(r.total, 3133);
  assert.equal(r.turns, 2);
  assert.equal(r.tools, 1);
  assert.equal(r.wallMs, 90000);
  assert.deepEqual(r.models, ["claude-haiku-5", "claude-opus-5-5"]);
});

test("buildRows by agent drops empty agents after filtering; by model groups across agents", () => {
  const a = parseTranscript(line({ id: "a", ts: "2026-11-27T07:00:00.000Z" }));
  const b = parseTranscript(line({ id: "b", ts: "2026-11-27T09:00:00.000Z", model: "claude-haiku-5" }));
  const sources = [{ label: "main", turns: a }, { label: "sub", turns: b }];
  assert.deepEqual(buildRows(sources, "agent", "2026-11-27T08:00:00Z").map((r) => r.label), ["sub"]);
  assert.deepEqual(buildRows(sources, "model").map((r) => r.label).sort(), ["claude-haiku-5", "claude-opus-5-5"]);
});

test("renderMarkdown emits header, separator, rows and totals", () => {
  const turns = parseTranscript(line({ id: "a", ts: "2026-11-27T07:00:00.000Z" }));
  const rows = [aggregate("main", turns), aggregate("x | y", turns)];
  const md = renderMarkdown(rows).split("\n");
  assert.equal(md.length, 5);
  assert.match(md[0]!, /^\| Agent \| Model\(s\) \| Input \| Output \| Cache write \| Cache read \| Total/);
  assert.match(md[1]!, /^\|---\|/);
  assert.match(md[3]!, /x \\\| y/);
  assert.match(md[4]!, /\*\*TOTAL\*\*.*\| 2 \| 0 \|/);
  assert.equal(totalsRow(rows).total, 2 * (2 + 100 + 1000 + 5000));
});

test("projectSlug replaces slashes and dots; parseArgs validates", () => {
  assert.equal(projectSlug("/Users/a.b/AStack"), "-Users-a-b-AStack");
  assert.equal(parseArgs(["--md", "--by", "model", "--since", "2026-11-27T00:00:00Z"]).by, "model");
  assert.throws(() => parseArgs(["--by", "x"]));
  assert.throws(() => parseArgs(["--since", "garbage"]));
  assert.throws(() => parseArgs(["--wat"]));
});
