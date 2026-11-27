import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DEFAULTS, loadConfig, projectConfigPath, userConfigPath } from "../scripts/lib/config.ts";

const CLI = join(import.meta.dirname, "..", "scripts", "config.ts");

function dirs() {
  return { home: mkdtempSync(join(tmpdir(), "astack-home-")), cwd: mkdtempSync(join(tmpdir(), "astack-cwd-")) };
}
function write(path: string, text: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}
function cli(home: string, cwd: string, ...args: string[]) {
  return spawnSync("node", [CLI, ...args], { cwd, env: { ...process.env, HOME: home }, encoding: "utf8" });
}

test("no files gives defaults", () => {
  const { home, cwd } = dirs();
  const warns: string[] = [];
  assert.deepEqual(loadConfig({ home, cwd, warn: (m) => warns.push(m) }), DEFAULTS);
  assert.equal(warns.length, 0);
});

test("project wins over user, deep merge keeps other defaults", () => {
  const { home, cwd } = dirs();
  write(userConfigPath(home), JSON.stringify({ models: { implementer: { model: "haiku" } }, notify: { push: false }, concurrency: 5 }));
  write(projectConfigPath(cwd), JSON.stringify({ concurrency: 4, unknownKey: 1 }));
  const warns: string[] = [];
  const c = loadConfig({ home, cwd, warn: (m) => warns.push(m) });
  assert.deepEqual(c.models.implementer, { model: "haiku" });
  assert.deepEqual(c.models.lead, DEFAULTS.models.lead);
  assert.equal(c.concurrency, 4);
  assert.equal(c.notify.push, false);
  assert.equal(c.notify.requestReview, true);
  assert.equal(warns.length, 0);
});

test("malformed JSON gives defaults and warns once with path", () => {
  const { home, cwd } = dirs();
  const p = userConfigPath(home);
  write(p, "{ nope");
  const warns: string[] = [];
  assert.deepEqual(loadConfig({ home, cwd, warn: (m) => warns.push(m) }), DEFAULTS);
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes(p));
});

test("invalid model falls back to role default and warns naming role", () => {
  const { home, cwd } = dirs();
  write(userConfigPath(home), JSON.stringify({ models: { lead: { model: "gpt" }, verify: { model: "opus", effort: "ludicrous" } } }));
  const warns: string[] = [];
  const c = loadConfig({ home, cwd, warn: (m) => warns.push(m) });
  assert.deepEqual(c.models.lead, DEFAULTS.models.lead);
  assert.deepEqual(c.models.verify, DEFAULTS.models.verify);
  assert.equal(warns.filter((w) => w.includes("lead")).length, 1);
  assert.equal(warns.filter((w) => w.includes("verify")).length, 1);
});

test("CLI set then get round-trips, preserving other keys", () => {
  const { home, cwd } = dirs();
  assert.equal(cli(home, cwd, "set", "concurrency", "7").status, 0);
  assert.equal(cli(home, cwd, "set", "models.lead", '{"model":"sonnet","effort":"low"}').status, 0);
  assert.equal(cli(home, cwd, "get", "concurrency").stdout.trim(), "7");
  assert.equal(cli(home, cwd, "get", "models.lead").stdout.trim(), '{"model":"sonnet","effort":"low"}');
  assert.equal(cli(home, cwd, "model", "lead").stdout.trim(), "sonnet low");
});

test("CLI get prints string values raw, other values as JSON", () => {
  const { home, cwd } = dirs();
  assert.equal(cli(home, cwd, "set", "notify.reviewer", '"octocat"').status, 0);
  assert.equal(cli(home, cwd, "get", "notify.reviewer").stdout, "octocat\n");
  assert.equal(cli(home, cwd, "get", "notify.push").stdout.trim(), "true");
});

test("CLI set --project writes project file; path prints it", () => {
  const { home, cwd } = dirs();
  assert.equal(cli(home, cwd, "set", "ciRetries", "9", "--project").status, 0);
  assert.equal(cli(home, cwd, "get", "ciRetries").stdout.trim(), "9");
  assert.ok(cli(home, cwd, "path", "--project").stdout.trim().endsWith(".astack/config.json"));
  assert.ok(cli(home, cwd, "path").stdout.trim().endsWith(".claude/astack/config.json"));
});

test("CLI model prints default and unknown role exits 2", () => {
  const { home, cwd } = dirs();
  assert.equal(cli(home, cwd, "model", "review-correctness").stdout.trim(), "fable high");
  const r = cli(home, cwd, "model", "nobody");
  assert.equal(r.status, 2);
  assert.ok(r.stderr.length > 0);
});
