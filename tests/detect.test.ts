import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectPacks } from "../scripts/lib/detect.ts";

const REPOS = join(import.meta.dirname, "fixtures", "repos");
const CLI = join(import.meta.dirname, "..", "scripts", "detect.ts");

function tmp(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "resonator-detect-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

test("fixtures", () => {
  assert.deepEqual(detectPacks(join(REPOS, "nuxt-bun")), ["bun", "nuxt"]);
  assert.deepEqual(detectPacks(join(REPOS, "nuxt-pnpm")), ["node", "nuxt"]);
  assert.deepEqual(detectPacks(join(REPOS, "node-npm")), ["node"]);
  assert.deepEqual(detectPacks(join(REPOS, "bun-elysia")), ["bun"]);
  assert.deepEqual(detectPacks(join(REPOS, "mono-nuxt")), ["node", "nuxt"]);
  assert.deepEqual(detectPacks(join(REPOS, "plain")), []);
});

test("missing dir yields empty", () => {
  assert.deepEqual(detectPacks(join(REPOS, "does-not-exist")), []);
});

test("malformed package.json does not throw; node still applies", () => {
  assert.deepEqual(detectPacks(tmp({ "package.json": "{not json" })), ["node"]);
});

test("workspace bun marker adds bun but keeps node", () => {
  const root = tmp({
    "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
    "packages/a/package.json": "{}",
    "packages/a/bun.lock": "",
  });
  assert.deepEqual(detectPacks(root), ["bun", "node"]);
});

test("root bun marker suppresses node; bunfig and bun-types count", () => {
  assert.deepEqual(detectPacks(tmp({ "package.json": "{}", "bunfig.toml": "" })), ["bun"]);
  assert.deepEqual(detectPacks(tmp({ "package.json": '{"devDependencies":{"bun-types":"1"}}' })), ["bun"]);
  assert.deepEqual(detectPacks(tmp({ "package.json": "{}", "bun.lockb": "" })), ["bun"]);
});

test("workspaces object form and literal dir; unsupported patterns ignored", () => {
  const root = tmp({
    "package.json": JSON.stringify({ workspaces: { packages: ["web", "**/x", "libs/*/y"] } }),
    "web/nuxt.config.mjs": "",
    "libs/q/y/nuxt.config.ts": "",
  });
  assert.deepEqual(detectPacks(root), ["node", "nuxt"]);
  const root2 = tmp({
    "package.json": JSON.stringify({ workspaces: ["libs/*/y"] }),
    "libs/q/y/nuxt.config.ts": "",
    "apps/z/nuxt.config.ts": "",
  });
  assert.deepEqual(detectPacks(root2), ["node"]);
});

test("fallback apps/* and packages/* without workspaces field", () => {
  const root = tmp({ "package.json": "{}", "packages/w/package.json": '{"dependencies":{"nuxt":"3"}}' });
  assert.deepEqual(detectPacks(root), ["node", "nuxt"]);
});

test("CLI prints single-line JSON, defaults to cwd", () => {
  const r = spawnSync(process.execPath, [CLI, join(REPOS, "nuxt-bun")], { encoding: "utf8" });
  assert.equal(r.stdout, '["bun","nuxt"]\n');
  const r2 = spawnSync(process.execPath, [CLI], { encoding: "utf8", cwd: join(REPOS, "node-npm") });
  assert.equal(r2.stdout, '["node"]\n');
});
