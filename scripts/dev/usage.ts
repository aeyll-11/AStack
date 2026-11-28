import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Turn {
  id: string;
  model: string;
  ts: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  toolIds: string[];
}

export interface Row {
  label: string;
  models: string[];
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  turns: number;
  tools: number;
  first: string;
  last: string;
  wallMs: number;
}

export interface Source {
  label: string;
  turns: Turn[];
}

type Json = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Parse one jsonl line into a partial turn; null for anything that is not an assistant message with usage. */
export function parseLine(line: string): Turn | null {
  let o: Json;
  try {
    o = JSON.parse(line) as Json;
  } catch {
    return null;
  }
  if (o.type !== "assistant" || typeof o.timestamp !== "string") return null;
  const msg = o.message as Json | undefined;
  const usage = msg?.usage as Json | undefined;
  if (!msg || !usage) return null;
  const model = typeof msg.model === "string" ? msg.model : "unknown";
  if (model === "<synthetic>") return null;
  const content = Array.isArray(msg.content) ? (msg.content as Json[]) : [];
  const toolIds = content
    .filter((c) => c.type === "tool_use")
    .map((c, i) => (typeof c.id === "string" ? c.id : `${String(o.uuid)}#${i}`));
  return {
    id: typeof msg.id === "string" ? msg.id : String(o.uuid),
    model,
    ts: o.timestamp,
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite: num(usage.cache_creation_input_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
    toolIds,
  };
}

/** Claude Code writes one jsonl line per content block, repeating the same message.id and usage; merge them. */
export function parseTranscript(text: string): Turn[] {
  const byId = new Map<string, Turn>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const t = parseLine(line);
    if (!t) continue;
    const prev = byId.get(t.id);
    if (!prev) {
      byId.set(t.id, t);
      continue;
    }
    prev.toolIds = [...new Set([...prev.toolIds, ...t.toolIds])];
    if (t.ts < prev.ts) prev.ts = t.ts;
    prev.output = Math.max(prev.output, t.output);
  }
  return [...byId.values()];
}

export function filterTurns(turns: Turn[], since?: string, until?: string): Turn[] {
  const s = since ? Date.parse(since) : -Infinity;
  const u = until ? Date.parse(until) : Infinity;
  return turns.filter((t) => {
    const ms = Date.parse(t.ts);
    return ms >= s && ms <= u;
  });
}

export function aggregate(label: string, turns: Turn[]): Row {
  const tsList = turns.map((t) => t.ts).sort();
  const first = tsList[0] ?? "";
  const last = tsList[tsList.length - 1] ?? "";
  const row: Row = {
    label,
    models: [...new Set(turns.map((t) => t.model))].sort(),
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    total: 0,
    turns: turns.length,
    tools: 0,
    first,
    last,
    wallMs: first ? Date.parse(last) - Date.parse(first) : 0,
  };
  for (const t of turns) {
    row.input += t.input;
    row.output += t.output;
    row.cacheWrite += t.cacheWrite;
    row.cacheRead += t.cacheRead;
    row.tools += t.toolIds.length;
  }
  row.total = row.input + row.output + row.cacheWrite + row.cacheRead;
  return row;
}

export function totalsRow(rows: Row[]): Row {
  const firsts = rows.map((r) => r.first).filter(Boolean).sort();
  const lasts = rows.map((r) => r.last).filter(Boolean).sort();
  const first = firsts[0] ?? "";
  const last = lasts[lasts.length - 1] ?? "";
  const t: Row = {
    label: "TOTAL",
    models: [...new Set(rows.flatMap((r) => r.models))].sort(),
    input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, turns: 0, tools: 0,
    first, last,
    wallMs: first ? Date.parse(last) - Date.parse(first) : 0,
  };
  for (const r of rows) {
    t.input += r.input; t.output += r.output; t.cacheWrite += r.cacheWrite; t.cacheRead += r.cacheRead;
    t.total += r.total; t.turns += r.turns; t.tools += r.tools;
  }
  return t;
}

export function buildRows(sources: Source[], by: "agent" | "model", since?: string, until?: string): Row[] {
  const filtered = sources.map((s) => ({ label: s.label, turns: filterTurns(s.turns, since, until) }));
  if (by === "model") {
    const groups = new Map<string, Turn[]>();
    for (const s of filtered) for (const t of s.turns) (groups.get(t.model) ?? groups.set(t.model, []).get(t.model)!).push(t);
    return [...groups].map(([m, ts]) => aggregate(m, ts)).sort((a, b) => b.total - a.total);
  }
  return filtered.filter((s) => s.turns.length > 0).map((s) => aggregate(s.label, s.turns));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const HEADERS = ["Agent", "Model(s)", "Input", "Output", "Cache write", "Cache read", "Total", "Turns", "Tool calls", "First", "Last", "Wall"];

function cells(r: Row, label: string): string[] {
  const n = (v: number) => v.toLocaleString("en-US");
  return [label, r.models.join(", "), n(r.input), n(r.output), n(r.cacheWrite), n(r.cacheRead), n(r.total), String(r.turns), String(r.tools), r.first, r.last, formatDuration(r.wallMs)];
}

export function renderMarkdown(rows: Row[], by: "agent" | "model" = "agent"): string {
  const head = [...HEADERS];
  head[0] = by === "model" ? "Model" : "Agent";
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const lines = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (const r of rows) lines.push(`| ${cells(r, r.label).map(esc).join(" | ")} |`);
  lines.push(`| ${cells(totalsRow(rows), "**TOTAL**").map(esc).join(" | ")} |`);
  return lines.join("\n");
}

export function renderText(rows: Row[]): string {
  const all = [...rows, totalsRow(rows)].map((r) => cells(r, r.label));
  const table = [HEADERS, ...all];
  const widths = HEADERS.map((_, i) => Math.max(...table.map((r) => r[i]!.length)));
  return table.map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd()).join("\n");
}

export function projectSlug(cwd: string): string {
  return resolve(cwd).replace(/[/.]/g, "-");
}

function readTurns(file: string): Turn[] {
  return parseTranscript(readFileSync(file, "utf8"));
}

export function loadSession(dir: string, sessionId: string): Source[] {
  const sources: Source[] = [{ label: "main", turns: readTurns(join(dir, `${sessionId}.jsonl`)) }];
  const subDir = join(dir, sessionId, "subagents");
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((n) => n.endsWith(".jsonl")).sort()) {
      const id = basename(f, ".jsonl");
      let label = id;
      try {
        const meta = JSON.parse(readFileSync(join(subDir, `${id}.meta.json`), "utf8")) as Json;
        const desc = typeof meta.description === "string" ? meta.description : "";
        const type = typeof meta.agentType === "string" ? meta.agentType : "";
        if (desc || type) label = `${desc || type}${desc && type ? ` (${type})` : ""} [${id.replace(/^agent-/, "")}]`;
      } catch {
        // no meta file: keep the file id
      }
      sources.push({ label, turns: readTurns(join(subDir, f)) });
    }
  }
  return sources;
}

export function latestSession(dir: string): string | null {
  const files = readdirSync(dir)
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => ({ n, m: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? basename(files[0].n, ".jsonl") : null;
}

interface Args {
  project: string;
  session?: string;
  since?: string;
  until?: string;
  by: "agent" | "model";
  md: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { project: process.cwd(), by: "agent", md: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${k} needs a value`);
      return v;
    };
    if (k === "--project") a.project = val();
    else if (k === "--session") a.session = val();
    else if (k === "--latest") a.session = undefined;
    else if (k === "--since" || k === "--until") {
      const v = val();
      if (Number.isNaN(Date.parse(v))) throw new Error(`${k}: invalid ISO timestamp ${v}`);
      a[k === "--since" ? "since" : "until"] = v;
    } else if (k === "--by") {
      const v = val();
      if (v !== "agent" && v !== "model") throw new Error("--by must be agent or model");
      a.by = v;
    } else if (k === "--md") a.md = true;
    else if (k === "--json") a.json = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects", projectSlug(a.project));
  if (!existsSync(dir)) throw new Error(`no transcripts at ${dir}`);
  const session = a.session ?? latestSession(dir);
  if (!session) throw new Error(`no sessions in ${dir}`);
  const rows = buildRows(loadSession(dir, session), a.by, a.since, a.until);
  if (a.json) console.log(JSON.stringify({ session, rows, totals: totalsRow(rows) }, null, 2));
  else if (a.md) console.log(renderMarkdown(rows, a.by));
  else console.log(`session ${session}\n${renderText(rows)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
