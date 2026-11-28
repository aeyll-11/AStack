import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface CommitCommand {
  dir: string | null;
  messages: string[];
  files: string[];
  authors: string[];
  trailers: string[];
}

export interface Identity {
  name: string;
  email: string;
}

export interface Context {
  identity: Identity | null;
  readFile: (path: string) => string | null;
}

const AI_NAME = /claude|anthropic|noreply@anthropic\.com|\bgpt\b|openai|copilot|gemini/i;
const CO_AUTHOR = /^\s*co-authored-by:\s*(.*)$/i;
const GENERATED = /generated\s+(?:with|by)\s+\[?[^\n]*?(?:claude|anthropic)/i;

function splitSegments(command: string): string[][] {
  const segments: string[][] = [];
  let tokens: string[] = [];
  let cur = "";
  let has = false;
  let quote: "'" | '"' | null = null;
  const endToken = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < command.length && /["\\$`]/.test(command[i + 1])) cur += command[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < command.length) {
      cur += command[++i];
      has = true;
    } else if (c === " " || c === "\t") {
      endToken();
    } else if (c === ";" || c === "&" || c === "|" || c === "\n" || c === "(" || c === ")") {
      endSegment();
    } else {
      cur += c;
      has = true;
    }
  }
  endSegment();
  return segments;
}

function commitArgs(tokens: string[]): { dir: string | null; args: string[] } | null {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] !== "git") return null;
  i++;
  let dir: string | null = null;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const t = tokens[i];
    if (t === "-C" && i + 1 < tokens.length) {
      dir = dir === null ? tokens[i + 1] : resolve(dir, tokens[i + 1]);
      i += 2;
    } else if (t === "-c" || t === "--git-dir" || t === "--work-tree" || t === "--namespace") {
      i += 2;
    } else i++;
  }
  if (tokens[i] !== "commit") return null;
  return { dir, args: tokens.slice(i + 1) };
}

function ghBodyArgs(tokens: string[]): string[] | null {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] !== "gh") return null;
  const [noun, verb] = [tokens[i + 1], tokens[i + 2]];
  const ok = (noun === "pr" && (verb === "create" || verb === "edit" || verb === "comment")) || (noun === "issue" && (verb === "create" || verb === "edit" || verb === "comment"));
  return ok ? tokens.slice(i + 3) : null;
}

function parseGhBody(args: string[], result: CommitCommand): void {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let m: RegExpExecArray | null;
    if ((m = /^--(body|body-file)=(.*)$/s.exec(a))) put(result, m[1] === "body" ? "message" : "file", m[2]);
    else if (a === "--body" || a === "-b") put(result, "message", i + 1 < args.length ? args[++i] : "");
    else if (a === "--body-file" || a === "-F") put(result, "file", i + 1 < args.length ? args[++i] : "");
  }
}

export function parseCommitCommand(command: string): CommitCommand | null {
  let result: CommitCommand | null = null;
  for (const tokens of splitSegments(command)) {
    const gh = ghBodyArgs(tokens);
    if (gh) {
      result ??= { dir: null, messages: [], files: [], authors: [], trailers: [] };
      parseGhBody(gh, result);
      continue;
    }
    const found = commitArgs(tokens);
    if (!found) continue;
    result ??= { dir: found.dir, messages: [], files: [], authors: [], trailers: [] };
    const { args } = found;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const next = () => (i + 1 < args.length ? args[++i] : "");
      let m: RegExpExecArray | null;
      if (a === "--") break;
      if ((m = /^--(message|file|author|trailer)=(.*)$/s.exec(a))) put(result, m[1], m[2]);
      else if (a === "--message" || a === "--file" || a === "--author" || a === "--trailer") put(result, a.slice(2), next());
      else if ((m = /^-[A-Za-z]*([mF])(.*)$/s.exec(a)) && !a.startsWith("--")) {
        const flagsBefore = a.slice(1, a.length - m[2].length - 1);
        if (/^[A-Za-z]*$/.test(flagsBefore)) put(result, m[1] === "m" ? "message" : "file", m[2] !== "" ? m[2] : next());
      }
    }
  }
  return result;
}

function put(c: CommitCommand, kind: string, value: string): void {
  if (kind === "message") c.messages.push(value);
  else if (kind === "file") c.files.push(value);
  else if (kind === "author") c.authors.push(value);
  else c.trailers.push(value);
}

function scanText(text: string, source: string, out: string[]): void {
  for (const line of text.split(/\r?\n/)) {
    const co = CO_AUTHOR.exec(line);
    if (co && AI_NAME.test(co[1])) out.push(`${source} has an AI co-author line: "${line.trim()}"`);
    else if (GENERATED.test(line)) out.push(`${source} has a "Generated with" attribution line: "${line.trim()}"`);
  }
}

export function findViolations(cmd: CommitCommand, ctx: Context, rawCommand?: string): string[] {
  const out: string[] = [];
  for (const m of cmd.messages) scanText(m, "the message/body", out);
  for (const t of cmd.trailers) scanText(t, "the --trailer", out);
  for (const t of cmd.trailers) if (!CO_AUTHOR.test(t) && AI_NAME.test(t) && /co-authored-by/i.test(t)) out.push(`the --trailer names an AI: "${t}"`);
  for (const f of cmd.files) {
    const text = ctx.readFile(resolve(cmd.dir ?? process.cwd(), f));
    if (text !== null) scanText(text, `the message file ${f}`, out);
  }
  if (rawCommand !== undefined && cmd.messages.length > 0 && out.length === 0) scanText(rawCommand, "the command", out);
  for (const a of cmd.authors) {
    const id = ctx.identity;
    if (id === null) out.push(`--author "${a}" is set but git user.name/user.email are not configured`);
    else if (a.trim() !== `${id.name} <${id.email}>`) out.push(`--author "${a}" is not the current git identity "${id.name} <${id.email}>"`);
  }
  return [...new Set(out)];
}

export function denial(violations: string[]): string {
  const reason = `Blocked by the Resonator commit guard: ${violations.join("; ")}. Remove the AI trailer or attribution line from the commit message, PR body, or comment (and drop --author unless it equals your git identity), then retry. Commits, PR bodies, and comments carry no AI attribution, per the resonator commit skill.`;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  });
}

function gitConfig(key: string, dir: string | null): string {
  const r = spawnSync("git", [...(dir ? ["-C", dir] : []), "config", key], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

function resolveIdentity(dir: string | null): Identity | null {
  const name = gitConfig("user.name", dir);
  const email = gitConfig("user.email", dir);
  return name !== "" && email !== "" ? { name, email } : null;
}

export function main(): void {
  try {
    const parsed: unknown = JSON.parse(readFileSync(0, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return;
    const input = (parsed as { tool_input?: { command?: unknown } }).tool_input;
    const command = input?.command;
    if (typeof command !== "string") return;
    const cmd = parseCommitCommand(command);
    if (cmd === null) return;
    const cwd = (parsed as { cwd?: unknown }).cwd;
    const base = cmd.dir ?? (typeof cwd === "string" ? cwd : null);
    if (cmd.dir === null && base !== null) cmd.dir = base;
    const ctx: Context = {
      identity: cmd.authors.length > 0 ? resolveIdentity(cmd.dir) : null,
      readFile: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
    };
    const violations = findViolations(cmd, ctx, command);
    if (violations.length > 0) process.stdout.write(denial(violations) + "\n");
  } catch {
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
