import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../scripts/lib/config.ts";
import type { ResonatorConfig } from "../scripts/lib/config.ts";
import { buildContext } from "../scripts/session-start.ts";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "session-start.ts");

function cfg(over: Partial<ResonatorConfig>): ResonatorConfig {
  return { ...DEFAULTS, ...over };
}

const ROUTER = join(here, "..", "skills", "resonator", "SKILL.md");
const BASE = `Resonator is active. Route every non-trivial engineering task through the /resonator:resonator router: Read ${ROUTER}, pick the playbook, follow it. Active stack packs:`;

test("router on, configured, packs", () => {
  assert.equal(buildContext(["bun", "nuxt"], cfg({ routerHook: true, configured: true })), `${BASE} bun, nuxt.`);
});

test("router on, no packs says none", () => {
  assert.equal(buildContext([], cfg({ routerHook: true, configured: true })), `${BASE} none.`);
});

test("router on, not configured appends setup hint", () => {
  assert.equal(
    buildContext(["node"], cfg({ routerHook: true, configured: false })),
    `${BASE} node. Resonator is not configured yet: suggest /resonator:setup-resonator once.`,
  );
});

test("router off: packs only, or null when empty", () => {
  assert.equal(buildContext(["bun", "nuxt"], cfg({ routerHook: false })), "Resonator stack packs: bun, nuxt.");
  assert.equal(buildContext([], cfg({ routerHook: false })), null);
});

test("hook with malformed stdin falls back to cwd, exits 0, empty stdout when nothing to say", () => {
  const home = mkdtempSync(join(tmpdir(), "resonator-home-"));
  mkdirSync(join(home, ".claude", "resonator"), { recursive: true });
  writeFileSync(join(home, ".claude", "resonator", "config.json"), JSON.stringify({ routerHook: false }));
  const emptyCwd = mkdtempSync(join(tmpdir(), "resonator-cwd-"));
  const r = spawnSync(process.execPath, [script], {
    input: "not json{",
    encoding: "utf8",
    cwd: emptyCwd,
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("hook prints SessionStart JSON for a repo with packs", () => {
  const repo = mkdtempSync(join(tmpdir(), "resonator-repo-"));
  writeFileSync(join(repo, "package.json"), "{}");
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ cwd: repo }),
    encoding: "utf8",
    env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), "resonator-home-")) },
  });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /Active stack packs: node\./);
  assert.ok(out.hookSpecificOutput.additionalContext.includes(`Read ${ROUTER},`));
});
