#!/usr/bin/env node
// Verification driver for this app. Generated from Resonator's app-cli template.
// Every command and its use is documented in ../SKILL.md. When the app changes, edit the config block, not the code.
// "auth": null for an app with no sign-in (login prints "skip no auth"). "auth": { "http": { method, route, json } } signs in with one
// request, no browser. "rootMarker": null for an app with no pages (no marker check). Secrets are "{env:NAME}", read from process.env.
// {port} and {baseUrl} are substituted in baseUrl, launch, teardown, and seed.
/* resonator-config
{
  "app": "<fill: app name, e.g. notes>",
  "port": 3100,
  "baseUrl": "http://127.0.0.1:{port}",
  "launch": "<fill: dev command, e.g. PORT={port} npm run dev>",
  "teardown": null,
  "readyPath": "<fill: route that answers only when usable, e.g. /api/health>",
  "readyTimeoutMs": 60000,
  "settleMs": 3000,
  "rootMarker": "<fill: stable app marker, e.g. testid:app-root>",
  "seed": { "command": "<fill: seed command>", "check": "<fill: read-only command that exits 0 when seed is present>" },
  "auth": {
    "route": "/login",
    "steps": [["fill", "label:Email", "<fill: seeded user>"], ["fill", "label:Password", "<fill: password>"], ["click", "button:Sign in"]],
    "check": "<fill: route that returns 2xx only when signed in, e.g. /api/me>"
  },
  "flag": { "kind": "cookie", "prefix": "flag_" }
}
resonator-config */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, request } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROLES = new Set(("alert alertdialog button checkbox cell columnheader combobox dialog grid gridcell heading img link list listitem " +
  "listbox main menu menubar menuitem menuitemcheckbox menuitemradio navigation option progressbar radio radiogroup region row " +
  "rowheader search searchbox slider spinbutton status switch tab table tablist tabpanel textbox toolbar tooltip tree treeitem").split(" "));
const BOOL_FLAGS = new Set(["headed", "idle", "all", "save-cookies"]);
const LIST_FLAGS = new Set(["header"]);
const STEP_ACTIONS = new Set(["fill", "click", "press"]);

export function parseArgs(argv) {
  const out = { cmd: "help", args: [], flags: {} };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith("--")) out.cmd = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    if (!a.startsWith("--")) { out.args.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    let val = v;
    if (val === undefined && BOOL_FLAGS.has(k)) val = true;
    else if (val === undefined && (!rest.length || rest[0].startsWith("--"))) throw new Error(`--${k} needs a value`);
    else if (val === undefined) val = rest.shift();
    out.flags[k] = LIST_FLAGS.has(k) ? [...(out.flags[k] ?? []), val] : val;
  }
  return out;
}

export function parseTarget(spec) {
  if (/^\s*\d+\s*[, ]\s*\d+\s*$/.test(spec)) throw new Error(`"${spec}" looks like coordinates. Target by role:name, testid:, label: or text:`);
  const i = spec.indexOf(":");
  const prefix = i > 0 ? spec.slice(0, i) : "";
  const value = spec.slice(i + 1);
  if (ROLES.has(prefix) || ["testid", "label", "text"].includes(prefix)) {
    if (!value) throw new Error(`target "${spec}" has an empty name`);
    return ROLES.has(prefix) ? { kind: "role", role: prefix, value } : { kind: prefix, value };
  }
  throw new Error(`target "${spec}" must be role:name (e.g. button:Save), testid:<id>, label:<text> or text:<text>`);
}

export const withPort = (s, port) => s.replaceAll("{port}", String(port));
export const expand = (s, { port, base }) => withPort(s.replaceAll("{baseUrl}", base), port);

export function parsePort(v) {
  const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`port must be an integer in 1..65535, got "${v}"`);
  return n;
}

const HTTP_USAGE = "usage: http <METHOD> <route> [--json <body>|--json-file <path>] [--header k:v]... [--expect <status>] [--out <path>] [--save-cookies]";
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CTL = /[\0-\x08\x0a-\x1f\x7f]/;

// {env:NAME} in strings, arrays and object values, from env only. Used for auth.http.json and --header values.
export function expandEnv(v, env) {
  if (typeof v === "string") return v.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => { if (env[n] === undefined) throw new Error(`env var ${n} is not set`); return env[n]; });
  if (Array.isArray(v)) return v.map((x) => expandEnv(x, env));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expandEnv(x, env)]));
  return v;
}

// --json is sent as given, unchecked, so a malformed body can be proven too. Header values keep {env:} unexpanded until send.
export function parseHttpArgs(args, flags, base, readFile = (p) => readFileSync(p, "utf8")) {
  if (args.length < 2) throw new Error(HTTP_USAGE);
  const method = args[0].toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error(`method "${args[0]}" must be letters only, e.g. GET`);
  const url = new URL(args[1], base);
  if (url.origin !== new URL(base).origin) throw new Error(`refusing ${url.origin}: not this app (${base})`);
  if (flags.json !== undefined && flags["json-file"] !== undefined) throw new Error("pass either --json or --json-file, not both");
  const body = flags["json-file"] !== undefined ? readFile(flags["json-file"]) : flags.json;
  const headers = body === undefined ? {} : { "content-type": "application/json" };
  for (const h of flags.header ?? []) {
    const i = h.indexOf(":");
    if (i < 1) throw new Error(`--header "${h}" must be k:v`);
    const [name, value] = [h.slice(0, i).trim(), h.slice(i + 1).trim()];
    if (!TOKEN.test(name)) throw new Error(`header name "${name}" may hold only letters, digits and !#$%&'*+.^_\`|~-`);
    if (CTL.test(value)) throw new Error(`header ${name} has a control character in its value`);
    headers[name.toLowerCase()] = value;
  }
  const t = String(flags.timeout ?? 10000);
  if (!/^\d+$/.test(t) || Number(t) < 1) throw new Error(`--timeout must be a positive whole number of milliseconds, got "${t}"`);
  return { method, url: url.href, headers, ...(body !== undefined && { body }), timeoutMs: Number(t) };
}

// Netscape cookie jar (what login writes, and what curl -c writes) to a Cookie header for this host.
export function jarCookies(text, url, nowSec = Date.now() / 1000) {
  const host = new URL(url).hostname;
  return text.split("\n").map((l) => l.replace(/^#HttpOnly_/, "")).filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"))
    .filter(([domain, , , , expires, name]) => {
      const d = domain.replace(/^\./, "");
      return name && (host === d || host.endsWith(`.${d}`)) && !(Number(expires) > 0 && Number(expires) < nowSec);
    })
    .map((c) => `${c[5]}=${c[6] ?? ""}`).join("; ");
}

function parseSetCookie(header, url, nowSec) {
  const [pair, ...attrs] = header.split(";");
  const eq = pair.indexOf("=");
  if (eq < 1) return null;
  const u = new URL(url);
  const c = { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: u.hostname, sub: "FALSE", path: u.pathname.slice(0, u.pathname.lastIndexOf("/")) || "/", secure: "FALSE", httpOnly: false };
  let maxAge, exp;
  for (const a of attrs) {
    const i = a.indexOf("="), key = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(), val = i < 0 ? "" : a.slice(i + 1).trim();
    if (key === "domain" && val) [c.domain, c.sub] = [`.${val.replace(/^\./, "")}`, "TRUE"];
    else if (key === "path" && val.startsWith("/")) c.path = val;
    else if (key === "secure") c.secure = "TRUE";
    else if (key === "httponly") c.httpOnly = true;
    else if (key === "max-age" && /^-?\d+$/.test(val)) maxAge = Number(val);
    else if (key === "expires" && !Number.isNaN(Date.parse(val))) exp = Math.floor(Date.parse(val) / 1000);
  }
  const at = maxAge !== undefined ? Math.floor(nowSec) + maxAge : exp;
  c.expires = at === undefined ? 0 : at <= nowSec ? -1 : at;
  return c;
}

// A tab, CR, or LF in a field would split or forge a tab-separated jar row.
export const jarSafe = (c) => [c.name, c.value, c.domain, c.path].every((f) => !/[\t\r\n]/.test(f));

// Response Set-Cookie headers into the Netscape jar that http reads and curl -b accepts. -1 expiry deletes.
export function mergeJar(text, setCookies, url, nowSec = Date.now() / 1000) {
  const rows = new Map();
  for (const l of text.split("\n")) {
    const f = l.replace(/^#HttpOnly_/, "").split("\t");
    if (l && (!l.startsWith("#") || l.startsWith("#HttpOnly_")) && f.length >= 7) rows.set(`${f[0]}\t${f[2]}\t${f[5]}`, l);
  }
  for (const c of setCookies.map((h) => parseSetCookie(h, url, nowSec)).filter((c) => c && jarSafe(c))) {
    const key = `${c.domain}\t${c.path}\t${c.name}`;
    if (c.expires < 0) rows.delete(key);
    else rows.set(key, `${c.httpOnly ? "#HttpOnly_" : ""}${[c.domain, c.sub, c.path, c.secure, c.expires, c.name, c.value].join("\t")}`);
  }
  return ["# Netscape HTTP Cookie File", ...rows.values(), ""].join("\n");
}

export function expectMatches(spec, status) {
  const parts = String(spec).split(",").map((p) => p.trim());
  if (!parts.every((p) => /^\d{3}$|^[1-5]xx$/i.test(p))) throw new Error(`--expect "${spec}" must be a status (201), a class (2xx), or a list (200,204)`);
  return parts.some((p) => (/x/i.test(p) ? Math.floor(status / 100) === Number(p[0]) : Number(p) === status));
}

const asJson = (t) => { if (t === undefined) return null; try { return JSON.parse(t); } catch { return t; } };
export const httpEvidence = (req, res) => ({
  request: { method: req.method, url: req.url, headers: req.headers, body: asJson(req.body) },
  status: res.status, statusText: res.statusText,
  headers: res.headers["set-cookie"] === undefined ? res.headers : { ...res.headers, "set-cookie": "<redacted>" }, body: asJson(res.body),
});

export function httpLine(status, body, max = 300) {
  const flat = body.replace(/\s+/g, " ").trim();
  const shown = flat.length > max ? `${flat.slice(0, max)}... (${Buffer.byteLength(body)} bytes)` : flat;
  return shown ? `${status} ${shown}` : String(status);
}

// Pid reuse guard: a recorded pid is ours only if the live process still matches what we recorded.
export function isOurProcess(ps, expect) {
  if (!ps) return false;
  const checks = [];
  if (expect.contains) checks.push(expect.contains.every((n) => ps.command.includes(n)));
  if (expect.started !== undefined) checks.push(!!ps.started && ps.started === expect.started);
  return checks.length > 0 && checks.every(Boolean);
}

export function parseConfigBlock(source) {
  const m = /\/\* resonator-config\n([\s\S]*?)\nresonator-config \*\//.exec(source);
  if (!m) throw new Error("no resonator-config block found");
  let raw;
  try { raw = JSON.parse(m[1]); } catch (e) { throw new Error(`config JSON: ${e.message}`); }
  const unfilled = [];
  const walk = (v, path) => {
    if (typeof v === "string" && v.includes("<fill")) unfilled.push(path);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(raw, "");
  if (unfilled.length) throw new Error(`unfilled config: ${unfilled.join(", ")}`);
  for (const k of ["app", "baseUrl", "launch", "readyPath"]) if (typeof raw[k] !== "string" || !raw[k]) throw new Error(`config: ${k} must be a non-empty string`);
  if (!Number.isInteger(raw.port)) throw new Error("config: port must be an integer");
  const c = { readyTimeoutMs: 60000, settleMs: 3000, rootMarker: null, teardown: null, seed: null, auth: null, flag: { kind: "cookie", prefix: "flag_" }, ...raw };
  if (c.rootMarker) try { parseTarget(c.rootMarker); } catch (e) { throw new Error(`config: rootMarker: ${e.message}`); }
  if (c.auth?.http && !(typeof c.auth.http.method === "string" && typeof c.auth.http.route === "string")) throw new Error("config: auth.http needs a method and a route");
  (c.auth?.steps ?? []).forEach(([action, target], i) => {
    try {
      if (!STEP_ACTIONS.has(action)) throw new Error(`unknown action "${action}"`);
      if (action !== "press") parseTarget(target);
    } catch (e) { throw new Error(`config: auth.steps[${i}]: ${e.message}`); }
  });
  return c;
}

// ---- runtime ----
const SELF = fileURLToPath(import.meta.url);
const ROOT = process.env.APP_ROOT ?? resolve(dirname(SELF), "../../../..");
const DIR = join(ROOT, ".resonator", "verify");
const F = { app: join(DIR, "app.json"), session: join(DIR, "session.json"), state: join(DIR, "state.json"), jar: join(DIR, "cookies.txt"), console: join(DIR, "console.log"),
  offset: join(DIR, "console.offset"), lastUrl: join(DIR, "last-url"), appLog: join(DIR, "app.log"), browserLog: join(DIR, "browser.log"), profile: join(DIR, "profile") };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const alive = (pid) => { if (!(pid > 0)) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line) => console.log(line);
class Exit extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function playwright() {
  const req = createRequire(join(ROOT, "package.json"));
  for (const name of ["playwright", "@playwright/test"]) { try { return req(name).chromium; } catch {} }
  const pm = existsSync(join(ROOT, "pnpm-lock.yaml")) ? "pnpm add -D" : existsSync(join(ROOT, "yarn.lock")) ? "yarn add -D" : existsSync(join(ROOT, "bun.lock")) || existsSync(join(ROOT, "bun.lockb")) ? "bun add -d" : "npm i -D";
  throw new Exit(3, `playwright not found from ${ROOT}. Install it: (cd ${ROOT} && ${pm} playwright && npx playwright install chromium)`);
}

function context(flags) {
  const cfg = parseConfigBlock(readFileSync(SELF, "utf8"));
  let port;
  try { port = parsePort(flags.port ?? readJson(F.app)?.port ?? cfg.port); } catch (e) { throw new Exit(2, e.message); }
  return { cfg, port, base: withPort(cfg.baseUrl, port) };
}

function listeners(port) {
  const r = spawnSync("lsof", ["-tnP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  return r.stdout.split("\n").filter(Boolean).map(Number);
}
// Playwright starts Chromium in its own process group, so signal the daemon's group and each child's group.
function killTree(pid, sig, kids = childrenOf(pid)) {
  for (const p of [pid, ...kids]) { try { process.kill(-p, sig); } catch { try { process.kill(p, sig); } catch {} } }
}
const childrenOf = (pid) => spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).map(Number);
function psInfo(pid) {
  if (!(pid > 0)) return null;
  const col = (c) => spawnSync("ps", ["-ww", "-o", `${c}=`, "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
  const command = col("command");
  return command ? { command, started: col("lstart") } : null;
}
const ourDaemon = (s) => !!s && isOurProcess(psInfo(s.pid), { contains: [SELF, "__serve"] });
function ourApp(app) {
  if (!app) return false;
  if (app.started && isOurProcess(psInfo(app.pid), { started: app.started })) return true;
  return listeners(app.port).some((p) => pgid(p) === app.pid);
}
const pgid = (pid) => Number(spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());

async function status(url, opts = {}) {
  try { return (await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), ...opts })).status; } catch { return 0; }
}
const jarHeader = (url) => (existsSync(F.jar) ? jarCookies(readFileSync(F.jar, "utf8"), url) : "");
function writeJar(text) {
  writeFileSync(F.jar, text, { mode: 0o600 });
  chmodSync(F.jar, 0o600);
}
function saveJar() {
  const rows = (readJson(F.state)?.cookies ?? []).filter(jarSafe).map((c) => [c.domain, c.domain.startsWith(".") ? "TRUE" : "FALSE", c.path, c.secure ? "TRUE" : "FALSE", Math.max(0, Math.floor(c.expires)), c.name, c.value].join("\t"));
  writeJar(`# Netscape HTTP Cookie File\n${rows.join("\n")}\n`);
}
function sh(cmd, env) { return spawnSync("sh", ["-c", cmd], { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } }).status; }

async function launch(x) {
  const prev = readJson(F.app);
  if (prev && ourApp(prev)) throw new Exit(1, `app already running pid=${prev.pid} port=${prev.port}. Run cleanup first`);
  const taken = listeners(x.port);
  if (taken.length) throw new Exit(1, `port ${x.port} is taken by pid ${taken.join(",")} (not ours). Pass --port <free port>`);
  const log = openSync(F.appLog, "a");
  const child = spawn("sh", ["-c", expand(x.cfg.launch, x)], { cwd: ROOT, detached: true, stdio: ["ignore", log, log], env: { ...process.env, PORT: String(x.port) } });
  child.unref();
  closeSync(log);
  writeFileSync(F.app, JSON.stringify({ pid: child.pid, port: x.port, started: psInfo(child.pid)?.started ?? "" }));
  const until = Date.now() + x.cfg.readyTimeoutMs;
  while (Date.now() < until) {
    const s = await status(x.base + x.cfg.readyPath);
    if (s > 0 && s < 500) return say(`ok launch pid=${child.pid} port=${x.port} url=${x.base}`);
    if (!alive(child.pid)) break;
    await sleep(1000);
  }
  await killApp(x);
  const tail = readFileSync(F.appLog, "utf8").split("\n").slice(-40).join("\n");
  throw new Exit(1, `app not ready at ${x.base + x.cfg.readyPath}\n${tail}`);
}

async function killApp(x) {
  const app = readJson(F.app);
  if (app && !ourApp(app)) say(`stale app record pid=${app.pid}: not ours any more, signalling nothing`);
  else if (app) {
    try { process.kill(-app.pid, "SIGTERM"); } catch {}
    for (let i = 0; i < 20 && listeners(app.port).length; i++) await sleep(250);
    try { process.kill(-app.pid, "SIGKILL"); } catch {}
  }
  if (x.cfg.teardown) sh(expand(x.cfg.teardown, x), { PORT: String(x.port) });
  rmSync(F.app, { force: true });
}

async function doctor(x) {
  const fails = [];
  const check = (ok, name, detail) => { say(`${ok ? "ok" : "fail"} ${name} ${detail}`); if (!ok) fails.push(name); };
  const app = readJson(F.app);
  check(ourApp(app), "process", app ? `pid=${app.pid}` : "not launched by this CLI");
  const owners = listeners(x.port);
  check(!!app && owners.length > 0 && owners.every((p) => p === app.pid || pgid(p) === app.pid), "port", `${x.port} listeners=${owners.join(",") || "none"}`);
  const s = await status(x.base + x.cfg.readyPath);
  check(s > 0 && s < 500, "ready", `${x.cfg.readyPath} -> ${s || "no answer"}`);
  if (x.cfg.seed?.check) { const c = expand(x.cfg.seed.check, x); check(sh(c, { PORT: String(x.port), BASE_URL: x.base }) === 0, "seed", c); }
  if (x.cfg.auth?.check) {
    const a = existsSync(F.jar) ? await status(x.base + x.cfg.auth.check, { headers: { cookie: jarHeader(x.base + x.cfg.auth.check) } }) : 0;
    check(a >= 200 && a < 300, "auth", existsSync(F.jar) ? `${x.cfg.auth.check} -> ${a}` : "no session, run login");
  }
  if (fails.length) throw new Exit(1, `doctor failed: ${fails.join(", ")}`);
}

async function serve(flags) {
  const chromium = playwright();
  const port = await new Promise((r) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const ctx = await chromium.launchPersistentContext(F.profile, { headless: !flags.headed, args: [`--remote-debugging-port=${port}`], viewport: { width: 1280, height: 800 } });
  const saved = readJson(F.state);
  if (saved?.cookies?.length) await ctx.addCookies(saved.cookies);
  const record = (line) => appendFileSync(F.console, `${new Date().toISOString()} ${line.replace(/\n/g, " ")}\n`);
  const hook = (pg) => {
    pg.on("console", (m) => { if (["error", "warning"].includes(m.type())) record(`${m.type()}: ${m.text()} (${pg.url()})`); });
    pg.on("pageerror", (e) => record(`pageerror: ${e.message} (${pg.url()})`));
  };
  ctx.pages().forEach(hook);
  ctx.on("page", hook);
  ctx.on("close", () => process.exit(1));
  process.on("exit", () => { if (readJson(F.session)?.pid === process.pid) rmSync(F.session, { force: true }); });
  for (const ev of ["uncaughtException", "unhandledRejection"]) process.on(ev, (e) => { console.error(e); process.exit(1); });
  const ctl = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    try {
      if (u.pathname === "/trace/start") await ctx.tracing.start({ screenshots: true, snapshots: true });
      else if (u.pathname === "/trace/stop") await ctx.tracing.stop({ path: u.searchParams.get("out") });
      else throw new Error(`unknown ${u.pathname}`);
      res.end("ok");
    } catch (e) { res.statusCode = 500; res.end(e.message); }
  });
  await new Promise((r) => ctl.listen(0, "127.0.0.1", r));
  const ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  writeFileSync(F.session, JSON.stringify({ wsEndpoint: ws, pid: process.pid, ctl: ctl.address().port, headed: !!flags.headed }));
  const quit = async () => { await ctx.close().catch(() => {}); process.exit(0); };
  process.on("SIGTERM", quit);
  process.on("SIGINT", quit);
}

async function startBrowser(flags) {
  const s = readJson(F.session);
  if (ourDaemon(s) && s.wsEndpoint) return say(`ok start pid=${s.pid} (already running)`);
  if (ourDaemon(s)) throw new Exit(1, `browser pid=${s.pid} is still starting or wedged. Run stop, then start`);
  playwright();
  rmSync(F.session, { force: true });
  const log = openSync(F.browserLog, "a");
  const child = spawn(process.execPath, [SELF, "__serve", ...(flags.headed ? ["--headed"] : [])], { cwd: ROOT, detached: true, stdio: ["ignore", log, log], env: process.env });
  child.unref();
  closeSync(log);
  writeFileSync(F.session, JSON.stringify({ pid: child.pid }));
  for (let i = 0; i < 120 && alive(child.pid); i++) {
    const n = readJson(F.session);
    if (n?.wsEndpoint) return say(`ok start pid=${n.pid} headed=${n.headed}`);
    await sleep(250);
  }
  if (ourDaemon({ pid: child.pid })) killTree(child.pid, "SIGKILL");
  rmSync(F.session, { force: true });
  const tail = readFileSync(F.browserLog, "utf8").split("\n").slice(-20).join("\n");
  throw new Exit(tail.includes("Executable doesn't exist") ? 3 : 1, `browser did not start. Try: (cd ${ROOT} && npx playwright install chromium)\n${tail}`);
}

async function stopBrowser() {
  const s = readJson(F.session);
  if (s && !ourDaemon(s)) {
    rmSync(F.session, { force: true });
    return say(`ok stop (stale session pid=${s.pid} is not our browser; signalled nothing)`);
  }
  if (s) {
    const kids = childrenOf(s.pid);
    killTree(s.pid, "SIGTERM", kids);
    for (let i = 0; i < 20 && [s.pid, ...kids].some(alive); i++) await sleep(250);
    killTree(s.pid, "SIGKILL", kids);
  }
  rmSync(F.session, { force: true });
  say(`ok stop${s ? ` pid=${s.pid}` : " (nothing running)"}`);
}

async function settle(page, cfg) {
  await page.waitForLoadState("networkidle", { timeout: cfg.settleMs }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
}

function locate(page, spec) {
  const t = parseTarget(spec);
  if (t.kind === "role") return page.getByRole(t.role, { name: t.value, exact: true });
  if (t.kind === "testid") return page.getByTestId(t.value);
  if (t.kind === "label") return page.getByLabel(t.value, { exact: true });
  return page.getByText(t.value, { exact: true });
}

async function snapshotOf(page) {
  try { return await page.locator("body").ariaSnapshot(); } catch { return JSON.stringify(await page.accessibility?.snapshot(), null, 1); }
}

async function withPage(x, flags, fn) {
  const chromium = playwright();
  if (!ourDaemon(readJson(F.session))) await startBrowser(flags);
  const cli = `node ${SELF}`;
  const last = existsSync(F.lastUrl) ? ` Last URL: ${readFileSync(F.lastUrl, "utf8")}` : "";
  const browser = await chromium.connectOverCDP(readJson(F.session)?.wsEndpoint ?? "").catch(() => {
    throw new Exit(1, `browser gone: run \`${cli} stop && ${cli} start\`, then reopen the page.${last}`);
  });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().filter((p) => !p.isClosed()).at(-1) ?? (await ctx.newPage());
  page.setDefaultTimeout(Number(flags.timeout ?? 10000));
  try {
    const out = await fn(page, ctx);
    await settle(page, x.cfg);
    await ctx.storageState({ path: F.state });
    writeFileSync(F.lastUrl, page.url());
    saveJar();
    return out;
  } catch (e) {
    if (e instanceof Exit) throw e;
    const snap = (await snapshotOf(page).catch(() => "")).split("\n").slice(0, 40).join("\n");
    throw new Exit(1, `${e.message.split("\n")[0]}\nurl: ${page.url()}\nsnapshot:\n${snap}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function act(page, x, [action, target, text]) {
  if (action === "press") return page.keyboard.press(target);
  const loc = locate(page, target);
  if (action === "click") await loc.click();
  else await loc.fill(text ?? "");
  await settle(page, x.cfg);
}

async function open(page, x, route) {
  const url = new URL(route, x.base);
  if (url.origin !== new URL(x.base).origin) throw new Error(`refusing ${url.origin}: not this app (${x.base})`);
  await page.goto(url.href);
  await settle(page, x.cfg);
  if (x.cfg.rootMarker) await locate(page, x.cfg.rootMarker).first().waitFor({ timeout: 10000 }).catch(() => { throw new Error(`app marker ${x.cfg.rootMarker} not found: not an app page`); });
}

async function ctlCall(path) {
  const s = readJson(F.session);
  if (!ourDaemon(s)) throw new Exit(1, "no browser running. Run start");
  return new Promise((ok, bad) => request({ host: "127.0.0.1", port: s.ctl, path, method: "POST" }, (res) => {
    let body = "";
    res.on("data", (d) => (body += d));
    res.on("end", () => (res.statusCode === 200 ? ok(body) : bad(new Exit(1, body))));
  }).on("error", bad).end());
}

// No browser: one fetch against the launched app, with the cookie jar when there is one.
async function send(req, saveCookies) {
  let headers;
  try {
    headers = expandEnv(req.headers, process.env);
    for (const [k, v] of Object.entries(headers)) if (CTL.test(v)) throw new Error(`header ${k}: its env value has a control character`);
  } catch (e) { throw new Exit(2, e.message); }
  const cookie = jarHeader(req.url);
  const res = await fetch(req.url, { method: req.method, headers: { ...(cookie && { cookie }), ...headers }, body: req.body, redirect: "manual", signal: AbortSignal.timeout(req.timeoutMs) })
    .catch((e) => { throw new Exit(1, `${req.method} ${req.url}: no answer (${e.cause?.code ?? e.message}). Run doctor`); });
  if (saveCookies) writeJar(mergeJar(existsSync(F.jar) ? readFileSync(F.jar, "utf8") : "", res.headers.getSetCookie(), req.url));
  return { cookie, got: { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers), body: await res.text() } };
}

async function http(x, args, flags, out) {
  let req;
  try { req = parseHttpArgs(args, flags, x.base); if (flags.expect !== undefined) expectMatches(flags.expect, 0); } catch (e) { throw new Exit(2, e.message); }
  const { cookie, got } = await send(req, flags["save-cookies"]);
  if (flags.out) {
    const o = out(flags.out);
    const sent = cookie && !("cookie" in req.headers) ? { ...req, headers: { ...req.headers, cookie: "<from .resonator/verify/cookies.txt>" } } : req;
    mkdirSync(dirname(o), { recursive: true });
    writeFileSync(o, `${JSON.stringify(httpEvidence(sent, got), null, 2)}\n`);
  }
  say(httpLine(got.status, got.body));
  if (flags.expect !== undefined && !expectMatches(flags.expect, got.status)) throw new Exit(1, `expected ${flags.expect}, got ${got.status}`);
}

async function loginHttp(x, form) {
  let req;
  try { req = parseHttpArgs([form.method, form.route], form.json === undefined ? {} : { json: JSON.stringify(expandEnv(form.json, process.env)) }, x.base); } catch (e) { throw new Exit(2, e.message); }
  const { got } = await send(req, true);
  if (got.status >= 400) throw new Exit(1, `login failed: ${req.method} ${form.route} -> ${got.status}`);
}

const need = (v, usage) => { if (v === undefined || v === "") throw new Exit(2, `usage: ${usage}`); return v; };

async function main(argv) {
  const { cmd, args, flags } = parseArgs(argv);
  mkdirSync(DIR, { recursive: true });
  if (cmd === "__serve") return serve(flags);
  if (cmd === "help") return say("commands: launch doctor http start stop open click fill press snapshot screenshot trace console wait reload flag login seed cleanup status. See ../SKILL.md");
  const x = context(flags);
  if (["click", "fill"].includes(cmd)) try { parseTarget(need(args[0], `${cmd} <target>`)); } catch (e) { throw e instanceof Exit ? e : new Exit(2, e.message); }
  const out = (p) => resolve(process.cwd(), need(p, `${cmd} --out <path>`));
  switch (cmd) {
    case "launch": return launch(x);
    case "doctor": return doctor(x);
    case "start": return startBrowser(flags);
    case "stop": return await stopBrowser();
    case "open": return withPage(x, flags, async (p) => { await open(p, x, need(args[0], "open <route>")); say(`ok open ${p.url()}`); });
    case "click": return withPage(x, flags, async (p) => { await act(p, x, ["click", need(args[0], "click <target>")]); say(`ok click ${args[0]} url=${p.url()}`); });
    case "fill": return withPage(x, flags, async (p) => { await act(p, x, ["fill", need(args[0], "fill <target> <text>"), args[1] ?? ""]); say(`ok fill ${args[0]}`); });
    case "press": return withPage(x, flags, async (p) => { await act(p, x, ["press", need(args[0], "press <key>")]); say(`ok press ${args[0]} url=${p.url()}`); });
    case "reload": return withPage(x, flags, async (p) => { await p.reload(); say(`ok reload ${p.url()}`); });
    case "snapshot": return withPage(x, flags, async (p) => { const s = await snapshotOf(p); if (flags.out) { const o = out(flags.out); mkdirSync(dirname(o), { recursive: true }); writeFileSync(o, s); } say(`url: ${p.url()}\n${s}`); });
    case "screenshot": return withPage(x, flags, async (p) => { const o = out(flags.out); mkdirSync(dirname(o), { recursive: true }); await p.screenshot({ path: o }); say(`ok screenshot ${o}`); });
    case "wait": return withPage(x, flags, async (p) => {
      const timeout = Number(flags.timeout ?? 10000);
      if (flags.text) await p.getByText(flags.text).first().waitFor({ timeout });
      else if (flags.testid) await p.getByTestId(flags.testid).first().waitFor({ timeout });
      else await p.waitForLoadState("networkidle", { timeout });
      say(`ok wait url=${p.url()}`);
    });
    case "trace": {
      const sub = need(args[0], "trace start|stop --out <path>");
      if (sub === "start") await ctlCall("/trace/start");
      else { const o = out(flags.out); mkdirSync(dirname(o), { recursive: true }); await ctlCall(`/trace/stop?out=${encodeURIComponent(o)}`); }
      return say(`ok trace ${sub}`);
    }
    case "console": {
      const text = existsSync(F.console) ? readFileSync(F.console, "utf8") : "";
      const from = Number(existsSync(F.offset) ? readFileSync(F.offset, "utf8") : 0);
      const fresh = text.slice(from > text.length ? 0 : from).split("\n").filter(Boolean);
      writeFileSync(F.offset, String(text.length));
      fresh.forEach((l) => say(l));
      return say(`ok console errors=${fresh.length}`);
    }
    case "flag": {
      const [name, state] = [need(args[0], "flag <name> <on|off>"), need(args[1], "flag <name> <on|off>")];
      if (!["on", "off"].includes(state)) throw new Exit(2, "usage: flag <name> <on|off>");
      const key = x.cfg.flag.prefix + name, value = state === "on" ? "1" : "0";
      return withPage(x, flags, async (p, ctx) => {
        if (x.cfg.flag.kind === "cookie") await ctx.addCookies([{ name: key, value, url: x.base }]);
        else { if (!p.url().startsWith(x.base)) await p.goto(x.base); await p.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]); }
        await p.reload();
        say(`ok flag ${name}=${state}`);
      });
    }
    case "http": return http(x, args, flags, out);
    case "login": {
      const auth = x.cfg.auth;
      if (!auth) return say("skip no auth");
      if (auth.http) await loginHttp(x, auth.http);
      else await withPage(x, flags, async (p) => { await open(p, x, auth.route); for (const step of auth.steps) await act(p, x, step); });
      if (auth.check) { const s = await status(x.base + auth.check, { headers: { cookie: jarHeader(x.base + auth.check) } }); if (s < 200 || s >= 300) throw new Exit(1, `login did not stick: ${auth.check} -> ${s}`); }
      return say(auth.http ? `ok login jar=${F.jar}` : `ok login state=${F.state}`);
    }
    case "seed": {
      if (!x.cfg.seed) throw new Exit(2, "no seed hook in config");
      const code = sh(expand(x.cfg.seed.command, x), { PORT: String(x.port), BASE_URL: x.base });
      if (code !== 0) throw new Exit(1, `seed failed: exit ${code}`);
      return say("ok seed");
    }
    case "cleanup": await stopBrowser(); await killApp(x); return say(`ok cleanup kept=${DIR}/console.log and your evidence`);
    case "status": {
      const app = readJson(F.app), s = readJson(F.session);
      return say(JSON.stringify({ app: app && { ...app, alive: ourApp(app) }, browser: s && { pid: s.pid, alive: ourDaemon(s), headed: s.headed }, base: x.base }));
    }
    default: throw new Exit(2, `unknown command "${cmd}". Run help`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`FAIL ${e.message}`);
    process.exit(e instanceof Exit ? e.code : 1);
  });
}
