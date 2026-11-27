import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Target {
  kind: "role" | "testid" | "label" | "text";
  role?: string;
  value: string;
}
interface Parsed {
  cmd: string;
  args: string[];
  flags: Record<string, string | boolean>;
}
interface Config {
  app: string;
  port: number;
  baseUrl: string;
  launch: string;
  readyPath: string;
  readyTimeoutMs: number;
  settleMs: number;
  rootMarker: string | null;
  teardown: string | null;
  seed: { command: string; check?: string } | null;
  auth: { route: string; steps: string[][]; check?: string } | null;
  flag: { kind: "cookie" | "localStorage"; prefix: string };
}
interface CliModule {
  parseArgs(argv: string[]): Parsed;
  parseTarget(spec: string): Target;
  parseConfigBlock(source: string): Config;
  withPort(s: string, port: number): string;
  parsePort(v: unknown): number;
  isOurProcess(ps: { command: string; started: string } | null, expect: { contains?: string[]; started?: string }): boolean;
}

const templatePath = fileURLToPath(new URL("../skills/create-verification-skill/templates/app-cli.mjs", import.meta.url));
const cli: CliModule = await import(templatePath);

const block = (json: string) => `#!/usr/bin/env node\n/* astack-config\n${json}\nastack-config */\nconsole.log(1);\n`;
const minimal = {
  app: "notes",
  port: 3100,
  baseUrl: "http://127.0.0.1:{port}",
  launch: "PORT={port} npm run dev",
  readyPath: "/api/health",
};

test("importing the template does not run the CLI", () => {
  assert.equal(typeof cli.parseArgs, "function");
});

test("parseArgs splits command, positionals, value flags and boolean flags", () => {
  assert.deepEqual(cli.parseArgs(["fill", "label:Title", "Release checklist", "--port", "3101"]), {
    cmd: "fill",
    args: ["label:Title", "Release checklist"],
    flags: { port: "3101" },
  });
  assert.deepEqual(cli.parseArgs(["start", "--headed"]), { cmd: "start", args: [], flags: { headed: true } });
  assert.deepEqual(cli.parseArgs(["wait", "--idle"]), { cmd: "wait", args: [], flags: { idle: true } });
  assert.deepEqual(cli.parseArgs(["screenshot", "--out=shots/a.png"]), { cmd: "screenshot", args: [], flags: { out: "shots/a.png" } });
  assert.deepEqual(cli.parseArgs(["wait", "--text", "Note saved"]).flags, { text: "Note saved" });
});

test("parseArgs with no command is help", () => {
  assert.equal(cli.parseArgs([]).cmd, "help");
});

test("parseArgs rejects a value flag with no value", () => {
  assert.throws(() => cli.parseArgs(["screenshot", "--out"]), /--out needs a value/);
});

test("parseTarget resolves role:name first", () => {
  assert.deepEqual(cli.parseTarget("button:Save"), { kind: "role", role: "button", value: "Save" });
  assert.deepEqual(cli.parseTarget("link:Docs: intro"), { kind: "role", role: "link", value: "Docs: intro" });
});

test("parseTarget then testid, label, text", () => {
  assert.deepEqual(cli.parseTarget("testid:save-btn"), { kind: "testid", value: "save-btn" });
  assert.deepEqual(cli.parseTarget("label:Email"), { kind: "label", value: "Email" });
  assert.deepEqual(cli.parseTarget("text:Note saved"), { kind: "text", value: "Note saved" });
});

test("parseTarget refuses coordinates", () => {
  assert.throws(() => cli.parseTarget("120,340"), /coordinates/);
  assert.throws(() => cli.parseTarget("120 340"), /coordinates/);
});

test("parseTarget refuses unknown prefixes and empty names", () => {
  assert.throws(() => cli.parseTarget("css:.btn"), /role:name/);
  assert.throws(() => cli.parseTarget("Save"), /role:name/);
  assert.throws(() => cli.parseTarget("button:"), /empty/);
});

test("parseConfigBlock reads the block and fills defaults", () => {
  const c = cli.parseConfigBlock(block(JSON.stringify(minimal)));
  assert.equal(c.app, "notes");
  assert.equal(c.port, 3100);
  assert.equal(c.readyTimeoutMs, 60000);
  assert.equal(c.rootMarker, null);
  assert.equal(c.seed, null);
  assert.equal(c.auth, null);
  assert.deepEqual(c.flag, { kind: "cookie", prefix: "flag_" });
});

test("parseConfigBlock requires the block markers", () => {
  assert.throws(() => cli.parseConfigBlock("console.log(1)"), /astack-config block/);
});

test("parseConfigBlock reports bad JSON", () => {
  assert.throws(() => cli.parseConfigBlock(block("{ app: notes }")), /config JSON/);
});

test("parseConfigBlock requires the core keys", () => {
  const { launch: _launch, ...rest } = minimal;
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify(rest))), /launch/);
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify({ ...minimal, port: "3100" }))), /port/);
});

test("parseConfigBlock rejects unfilled placeholders", () => {
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify({ ...minimal, launch: "<fill: dev command>" }))), /unfilled.*launch/);
});

test("parseConfigBlock validates the root marker and auth steps as targets", () => {
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify({ ...minimal, rootMarker: "#app" }))), /rootMarker/);
  const auth = { route: "/login", steps: [["fill", "label:Email", "v@example.test"], ["tap", "button:Sign in"]] };
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify({ ...minimal, auth }))), /auth.steps\[1\]/);
  const ok = { route: "/login", steps: [["fill", "label:Email", "v@example.test"], ["click", "button:Sign in"]] };
  assert.equal(cli.parseConfigBlock(block(JSON.stringify({ ...minimal, rootMarker: "testid:app-root", auth: ok }))).auth?.route, "/login");
});

test("the shipped template's own config block is unfilled", () => {
  assert.throws(() => cli.parseConfigBlock(readFileSync(templatePath, "utf8")), /unfilled/);
});

test("withPort substitutes every {port}", () => {
  assert.equal(cli.withPort("PORT={port} vite --port {port}", 3101), "PORT=3101 vite --port 3101");
});

test("parsePort accepts 1..65535 integers only", () => {
  assert.equal(cli.parsePort("3101"), 3101);
  assert.equal(cli.parsePort(3100), 3100);
  for (const bad of ["0", "65536", "abc", "31.5", "", "-1", "3100x"]) assert.throws(() => cli.parsePort(bad), /port/, bad);
});

test("isOurProcess matches the daemon by its script path and __serve", () => {
  const cli1 = "/repo/.claude/skills/verify-notes/scripts/notes-cli.mjs";
  const ps = { command: `/usr/local/bin/node ${cli1} __serve --headed`, started: "Fri Nov 27 10:00:00 2026" };
  assert.equal(cli.isOurProcess(ps, { contains: [cli1, "__serve"] }), true);
  assert.equal(cli.isOurProcess({ ...ps, command: "/usr/bin/vim notes.txt" }, { contains: [cli1, "__serve"] }), false);
  assert.equal(cli.isOurProcess({ ...ps, command: `node ${cli1} open /notes` }, { contains: [cli1, "__serve"] }), false);
});

test("isOurProcess matches the app by its recorded start time", () => {
  const ps = { command: "node server.mjs", started: "Fri Nov 27 10:00:00 2026" };
  assert.equal(cli.isOurProcess(ps, { started: "Fri Nov 27 10:00:00 2026" }), true);
  assert.equal(cli.isOurProcess(ps, { started: "Fri Nov 27 09:59:59 2026" }), false);
});

test("isOurProcess never matches a gone process or an empty expectation", () => {
  assert.equal(cli.isOurProcess(null, { started: "x" }), false);
  assert.equal(cli.isOurProcess({ command: "node a", started: "x" }, {}), false);
  assert.equal(cli.isOurProcess({ command: "node a", started: "" }, { started: "" }), false);
});
