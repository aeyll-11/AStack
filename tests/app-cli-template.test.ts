import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Target {
  kind: "role" | "testid" | "label" | "text";
  role?: string;
  value: string;
}
interface Parsed {
  cmd: string;
  args: string[];
  flags: Record<string, string | boolean | string[]>;
}
interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
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
  auth: { route?: string; steps?: string[][]; http?: { method: string; route: string; json?: unknown }; check?: string } | null;
  flag: { kind: "cookie" | "localStorage"; prefix: string };
}
interface CliModule {
  parseArgs(argv: string[]): Parsed;
  parseTarget(spec: string): Target;
  parseConfigBlock(source: string): Config;
  withPort(s: string, port: number): string;
  parsePort(v: unknown): number;
  isOurProcess(ps: { command: string; started: string } | null, expect: { contains?: string[]; started?: string }): boolean;
  expand(s: string, vars: { port: number; base: string }): string;
  parseHttpArgs(args: string[], flags: Parsed["flags"], base: string, readFile?: (p: string) => string): HttpRequest;
  jarCookies(text: string, url: string, nowSec?: number): string;
  expectMatches(spec: string, status: number): boolean;
  httpEvidence(req: HttpRequest, res: HttpResponse): { request: HttpRequest & { body: unknown }; status: number; statusText: string; headers: Record<string, string>; body: unknown };
  httpLine(status: number, body: string, max?: number): string;
  expandEnv<T>(v: T, env: Record<string, string | undefined>): T;
  mergeJar(text: string, setCookies: string[], url: string, nowSec?: number): string;
  jarSafe(c: { name: string; value: string; domain: string; path: string }): boolean;
}

const templatePath = fileURLToPath(new URL("../skills/create-verification-skill/templates/app-cli.mjs", import.meta.url));
const cli: CliModule = await import(templatePath);

const block = (json: string) => `#!/usr/bin/env node\n/* resonator-config\n${json}\nresonator-config */\nconsole.log(1);\n`;
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
  assert.throws(() => cli.parseConfigBlock("console.log(1)"), /resonator-config block/);
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

test("parseArgs collects every --header into a list", () => {
  assert.deepEqual(cli.parseArgs(["http", "GET", "/x", "--header", "a:1", "--header=b: 2"]).flags, { header: ["a:1", "b: 2"] });
  assert.deepEqual(cli.parseArgs(["http", "GET", "/x", "--header", "a:1"]).flags, { header: ["a:1"] });
});

test("expand substitutes {port} and {baseUrl}", () => {
  assert.equal(cli.expand("curl {baseUrl}/todos && echo {port}", { port: 3555, base: "http://127.0.0.1:3555" }), "curl http://127.0.0.1:3555/todos && echo 3555");
  assert.equal(cli.expand("PORT={port} x --port {port}", { port: 3101, base: "" }), "PORT=3101 x --port 3101");
});

const base = "http://127.0.0.1:3555";

test("parseHttpArgs builds a GET with an upper-cased method", () => {
  assert.deepEqual(cli.parseHttpArgs(["get", "/health?x=1"], {}, base), { method: "GET", url: `${base}/health?x=1`, headers: {}, timeoutMs: 10000 });
});

test("parseHttpArgs sends --json as the body with a JSON content type", () => {
  const r = cli.parseHttpArgs(["POST", "/todos"], { json: '{"title":"x"}' }, base);
  assert.equal(r.body, '{"title":"x"}');
  assert.equal(r.headers["content-type"], "application/json");
});

test("parseHttpArgs sends --json unchecked, so a malformed body can be proven", () => {
  assert.equal(cli.parseHttpArgs(["POST", "/todos"], { json: "{bad" }, base).body, "{bad");
});

test("parseHttpArgs reads --json-file through the reader", () => {
  const r = cli.parseHttpArgs(["PUT", "/todos/1"], { "json-file": "body.json" }, base, (p) => (p === "body.json" ? '{"a":1}' : ""));
  assert.equal(r.body, '{"a":1}');
  assert.equal(r.headers["content-type"], "application/json");
});

test("parseHttpArgs refuses --json with --json-file", () => {
  assert.throws(() => cli.parseHttpArgs(["POST", "/x"], { json: "{}", "json-file": "a.json" }, base, () => "{}"), /either --json or --json-file/);
});

test("parseHttpArgs adds --header values, which override the defaults", () => {
  const r = cli.parseHttpArgs(["POST", "/x"], { json: "{}", header: ["X-Trace: abc", "content-type:text/plain"] }, base);
  assert.deepEqual(r.headers, { "content-type": "text/plain", "x-trace": "abc" });
  assert.throws(() => cli.parseHttpArgs(["GET", "/x"], { header: ["nocolon"] }, base), /k:v/);
});

test("parseHttpArgs refuses a bad header name, a control character in a value, and a bad --timeout", () => {
  assert.throws(() => cli.parseHttpArgs(["GET", "/x"], { header: ["bad name:1"] }, base), /header name "bad name"/);
  assert.throws(() => cli.parseHttpArgs(["GET", "/x"], { header: ["x-a:1\r\nx-b:2"] }, base), /control character/);
  for (const t of ["0", "-5", "abc", "1.5"]) assert.throws(() => cli.parseHttpArgs(["GET", "/x"], { timeout: t }, base), /--timeout/, t);
  assert.equal(cli.parseHttpArgs(["GET", "/x"], { timeout: "2500" }, base).timeoutMs, 2500);
});

test("parseHttpArgs keeps {env:} placeholders unexpanded, so evidence never holds the secret", () => {
  assert.equal(cli.parseHttpArgs(["GET", "/x"], { header: ["Authorization: Bearer {env:VERIFY_TOKEN}"] }, base).headers.authorization, "Bearer {env:VERIFY_TOKEN}");
});

test("expandEnv fills {env:NAME} in strings, arrays and objects from the given env only", () => {
  const env = { VERIFY_USER: "v@example.test", VERIFY_PASS: "p\"w" };
  assert.equal(cli.expandEnv("Bearer {env:VERIFY_USER}", env), "Bearer v@example.test");
  assert.deepEqual(cli.expandEnv({ email: "{env:VERIFY_USER}", password: "{env:VERIFY_PASS}", n: 1, tags: ["{env:VERIFY_USER}"] }, env), { email: "v@example.test", password: 'p"w', n: 1, tags: ["v@example.test"] });
  assert.equal(cli.expandEnv("{port} {baseUrl} $HOME", env), "{port} {baseUrl} $HOME");
});

test("expandEnv names the missing variable", () => {
  assert.throws(() => cli.expandEnv({ a: "{env:VERIFY_TOKEN}" }, {}), /VERIFY_TOKEN/);
});

test("mergeJar writes Set-Cookie into Netscape rows that jarCookies reads back", () => {
  const jar = cli.mergeJar("", ["sid=abc; Path=/; HttpOnly", "pref=dark; Max-Age=3600; Path=/; Secure"], `${base}/api/login`, 1000);
  assert.equal(jar, ["# Netscape HTTP Cookie File", "#HttpOnly_127.0.0.1\tFALSE\t/\tFALSE\t0\tsid\tabc", "127.0.0.1\tFALSE\t/\tTRUE\t4600\tpref\tdark", ""].join("\n"));
  assert.equal(cli.jarCookies(jar, `${base}/todos`, 1000), "sid=abc; pref=dark");
});

test("mergeJar replaces a cookie, deletes an expired one, and keeps the rest", () => {
  const first = cli.mergeJar("", ["sid=old; Path=/", "keep=1; Path=/"], `${base}/login`, 1000);
  const next = cli.mergeJar(first, ["sid=new; Path=/", "keep=; Max-Age=0; Path=/"], `${base}/login`, 1000);
  assert.equal(cli.jarCookies(next, base, 1000), "sid=new");
  const gone = cli.mergeJar(first, ["sid=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/"], `${base}/login`, 1000);
  assert.equal(cli.jarCookies(gone, base, 1000), "keep=1");
});

test("mergeJar uses the Domain attribute and the default path", () => {
  const jar = cli.mergeJar("", ["a=1; Domain=.example.test", "b=2"], "https://app.example.test/api/auth/login", 0);
  assert.match(jar, /^\.example\.test\tTRUE\t\/api\/auth\tFALSE\t0\ta\t1$/m);
  assert.match(jar, /^app\.example\.test\tFALSE\t\/api\/auth\tFALSE\t0\tb\t2$/m);
});

test("jarSafe rejects a tab, CR, or LF in any jar field", () => {
  const ok = { name: "sid", value: "abc", domain: "127.0.0.1", path: "/" };
  assert.equal(cli.jarSafe(ok), true);
  for (const field of ["name", "value", "domain", "path"] as const) {
    for (const bad of ["\t", "\r", "\n"]) assert.equal(cli.jarSafe({ ...ok, [field]: `a${bad}b` }), false, `${field} with ${JSON.stringify(bad)}`);
  }
});

test("mergeJar skips a Set-Cookie that would forge a jar row and keeps the rest", () => {
  const jar = cli.mergeJar("", ["evil=x\t127.0.0.1\tFALSE\t/\tFALSE\t0\tadmin\t1; Path=/", "a=1; Path=/\tx", "b=2; Domain=ex\tample.test", "ok=1; Path=/"], `${base}/login`, 1000);
  assert.equal(jar, ["# Netscape HTTP Cookie File", "127.0.0.1\tFALSE\t/\tFALSE\t0\tok\t1", ""].join("\n"));
});

test("httpEvidence redacts Set-Cookie values", () => {
  const e = cli.httpEvidence({ method: "POST", url: base, headers: {}, timeoutMs: 10000 }, { status: 204, statusText: "No Content", headers: { "set-cookie": "sid=abc" }, body: "" });
  assert.equal(e.headers["set-cookie"], "<redacted>");
  assert.equal("timeoutMs" in e.request, false);
});

test("parseConfigBlock accepts an HTTP auth form and requires its method and route", () => {
  const auth = { http: { method: "POST", route: "/api/login", json: { email: "{env:VERIFY_USER}" } }, check: "/api/me" };
  assert.equal(cli.parseConfigBlock(block(JSON.stringify({ ...minimal, auth }))).auth?.http?.route, "/api/login");
  assert.throws(() => cli.parseConfigBlock(block(JSON.stringify({ ...minimal, auth: { http: { method: "POST" } } }))), /auth.http/);
});

test("parseHttpArgs refuses another origin, a bad method, and missing args", () => {
  assert.throws(() => cli.parseHttpArgs(["GET", "https://example.com/x"], {}, base), /not this app/);
  assert.throws(() => cli.parseHttpArgs(["G ET", "/x"], {}, base), /method/);
  assert.throws(() => cli.parseHttpArgs(["GET"], {}, base), /usage: http/);
});

test("jarCookies reads a Netscape jar for the request host", () => {
  const jar = [
    "# Netscape HTTP Cookie File",
    "127.0.0.1\tFALSE\t/\tFALSE\t0\tsid\tabc",
    "#HttpOnly_127.0.0.1\tFALSE\t/\tFALSE\t0\tcsrf\tt1",
    "other.test\tFALSE\t/\tFALSE\t0\tnope\t1",
    "127.0.0.1\tFALSE\t/\tFALSE\t100\told\tgone",
    "",
  ].join("\n");
  assert.equal(cli.jarCookies(jar, `${base}/todos`, 1000), "sid=abc; csrf=t1");
  assert.equal(cli.jarCookies("", `${base}/todos`), "");
});

test("expectMatches takes an exact status, a class, or a list", () => {
  assert.equal(cli.expectMatches("201", 201), true);
  assert.equal(cli.expectMatches("201", 200), false);
  assert.equal(cli.expectMatches("2xx", 204), true);
  assert.equal(cli.expectMatches("4xx", 500), false);
  assert.equal(cli.expectMatches("200,204", 204), true);
  assert.throws(() => cli.expectMatches("ok", 200), /--expect/);
});

test("httpEvidence records request, status, headers and body, parsing JSON bodies", () => {
  const req = { method: "POST", url: `${base}/todos`, headers: { "content-type": "application/json" }, body: '{"title":"x"}' };
  const res = { status: 201, statusText: "Created", headers: { "content-type": "application/json" }, body: '{"id":1,"title":"x"}' };
  assert.deepEqual(cli.httpEvidence(req, res), {
    request: { method: "POST", url: `${base}/todos`, headers: { "content-type": "application/json" }, body: { title: "x" } },
    status: 201,
    statusText: "Created",
    headers: { "content-type": "application/json" },
    body: { id: 1, title: "x" },
  });
  const html = cli.httpEvidence({ method: "GET", url: base, headers: {} }, { status: 400, statusText: "Bad Request", headers: {}, body: "<pre>boom</pre>" });
  assert.equal(html.body, "<pre>boom</pre>");
  assert.equal(html.request.body, null);
});

test("httpLine prints status and body on one truncated line", () => {
  assert.equal(cli.httpLine(200, '{"ok":true}'), '200 {"ok":true}');
  assert.equal(cli.httpLine(400, "a\n  b\n"), "400 a b");
  const long = cli.httpLine(200, "x".repeat(500), 20);
  assert.equal(long, `200 ${"x".repeat(20)}... (500 bytes)`);
  assert.equal(cli.httpLine(204, ""), "204");
});

test("parseConfigBlock accepts auth: null and rootMarker: null for an API with no pages", () => {
  const c = cli.parseConfigBlock(block(JSON.stringify({ ...minimal, rootMarker: null, auth: null })));
  assert.equal(c.rootMarker, null);
  assert.equal(c.auth, null);
});

// Writes a filled copy of the template into a temp app root, ready to run as a CLI.
function writeFilled(config: object): { file: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "app-cli-"));
  const dir = join(root, ".claude/skills/verify-notes/scripts");
  mkdirSync(dir, { recursive: true });
  const filled = `/* resonator-config\n${JSON.stringify(config)}\nresonator-config */`;
  const file = join(dir, "notes-cli.mjs");
  writeFileSync(file, readFileSync(templatePath, "utf8").replace(/\/\* resonator-config\n[\s\S]*?\nresonator-config \*\//, () => filled));
  return { file, env: { ...process.env, APP_ROOT: root } };
}

function runFilled(config: object, argv: string[]) {
  const { file, env } = writeFilled(config);
  return spawnSync(process.execPath, [file, ...argv], { encoding: "utf8", env });
}

test("login with auth: null prints skip and exits 0", () => {
  const r = runFilled({ ...minimal, port: 3997, auth: null, rootMarker: null }, ["login"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "skip no auth");
});

test("doctor prints seed.check with placeholders substituted and no auth line when auth is null", () => {
  const seed = { command: "true", check: "test {port} = 3998 && test {baseUrl} = http://127.0.0.1:3998" };
  const r = runFilled({ ...minimal, port: 3998, auth: null, rootMarker: null, seed }, ["doctor"]);
  assert.match(r.stdout, /^ok seed test 3998 = 3998 && test http:\/\/127\.0\.0\.1:3998 = http:\/\/127\.0\.0\.1:3998$/m);
  assert.doesNotMatch(r.stdout, /\{port\}|\bauth\b/);
  assert.equal(r.status, 1);
});

test("http needs no Playwright and exits 1 on an expect mismatch", async () => {
  const server = createServer((req, res) => { res.statusCode = req.url === "/health" ? 200 : 404; res.setHeader("content-type", "application/json"); res.end('{"status":"ok"}'); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    const cfg = { ...minimal, port, auth: null, rootMarker: null };
    const ok = await runAsync(cfg, ["http", "GET", "/health", "--expect", "200"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), '200 {"status":"ok"}');
    const bad = await runAsync(cfg, ["http", "GET", "/nope", "--expect", "200"]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /expected 200, got 404/);
  } finally {
    server.close();
  }
});

// The test server runs in this process, so the CLI must run without blocking the event loop.
async function runAsync(config: object, argv: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const { file, env } = writeFilled(config);
  return runFile(file, argv, env);
}

async function runFile(file: string, argv: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [file, ...argv], { env });
  let stdout = "", stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d));
  child.stderr.on("data", (d: Buffer) => (stderr += d));
  const status = await new Promise<number | null>((r) => child.on("close", r));
  return { status, stdout, stderr };
}

test("http --save-cookies and an HTTP auth login fill the jar, need no Playwright, and the jar rides on later calls", async () => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d: Buffer) => (body += d));
    req.on("end", () => {
      if (req.url === "/api/login") {
        const ok = req.headers.authorization === undefined && body === JSON.stringify({ email: "v@example.test", password: "s3cret" });
        if (ok) res.setHeader("set-cookie", ["sid=abc; Path=/; HttpOnly"]);
        res.statusCode = ok ? 204 : 401;
        return res.end();
      }
      if (req.url === "/api/me") { res.statusCode = req.headers.cookie === "sid=abc" ? 200 : 401; return res.end(String(req.headers.cookie ?? "")); }
      if (req.url === "/token") { res.statusCode = req.headers.authorization === "Bearer t0k" ? 200 : 401; return res.end(); }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const auth = { http: { method: "POST", route: "/api/login", json: { email: "{env:VERIFY_USER}", password: "{env:VERIFY_PASS}" } }, check: "/api/me" };
  const cfg = { ...minimal, port, rootMarker: null, auth };
  try {
    const { file, env } = writeFilled(cfg);
    const run = (argv: string[], extra: Record<string, string> = {}) => runFile(file, argv, { ...env, ...extra });
    const missing = await run(["login"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /VERIFY_USER/);
    const login = await run(["login"], { VERIFY_USER: "v@example.test", VERIFY_PASS: "s3cret" });
    assert.equal(login.status, 0, login.stderr);
    assert.match(login.stdout, /^ok login jar=/m);
    const jarPath = join(env.APP_ROOT ?? "", ".resonator/verify/cookies.txt");
    const jar = readFileSync(jarPath, "utf8");
    assert.equal(statSync(jarPath).mode & 0o777, 0o600);
    assert.match(jar, /^#HttpOnly_127\.0\.0\.1\tFALSE\t\/\tFALSE\t0\tsid\tabc$/m);
    assert.doesNotMatch(jar, /s3cret/);
    const me = await run(["http", "GET", "/api/me", "--expect", "200"]);
    assert.equal(me.stdout.trim(), "200 sid=abc");
    rmSync(join(env.APP_ROOT ?? "", ".resonator/verify/cookies.txt"));
    const body = JSON.stringify({ email: "v@example.test", password: "s3cret" });
    writeFileSync(jarPath, "# Netscape HTTP Cookie File\n", { mode: 0o644 });
    chmodSync(jarPath, 0o644);
    const saved = await run(["http", "POST", "/api/login", "--json", body, "--save-cookies", "--expect", "204"]);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(statSync(jarPath).mode & 0o777, 0o600);
    assert.equal((await run(["http", "GET", "/api/me", "--expect", "200"])).stdout.trim(), "200 sid=abc");
    const bearer = await run(["http", "GET", "/token", "--header", "Authorization: Bearer {env:VERIFY_TOKEN}", "--expect", "200", "--out", join(env.APP_ROOT ?? "", "t.json")], { VERIFY_TOKEN: "t0k" });
    assert.equal(bearer.status, 0, bearer.stderr);
    assert.doesNotMatch(readFileSync(join(env.APP_ROOT ?? "", "t.json"), "utf8"), /t0k/);
    const noToken = await run(["http", "GET", "/token", "--header", "Authorization: Bearer {env:VERIFY_TOKEN}"]);
    assert.equal(noToken.status, 2);
    assert.match(noToken.stderr, /VERIFY_TOKEN/);
  } finally {
    server.close();
  }
});
