import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, projectConfigPath, readJsonObject, ROLES, userConfigPath } from "./lib/config.ts";
import type { Role } from "./lib/config.ts";

type Obj = Record<string, unknown>;

function getPath(obj: unknown, key: string): unknown {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Obj)[part];
  }
  return cur;
}

function setPath(obj: Obj, key: string, value: unknown): void {
  const parts = key.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (typeof next === "object" && next !== null && !Array.isArray(next)) {
      cur = next as Obj;
    } else {
      const fresh: Obj = {};
      cur[part] = fresh;
      cur = fresh;
    }
  }
  cur[parts[parts.length - 1]] = value;
}

function fail(msg: string, code: number): never {
  process.stderr.write(`resonator: ${msg}\n`);
  process.exit(code);
}

export function main(argv: string[]): void {
  const project = argv.includes("--project");
  const args = argv.filter((a) => a !== "--project");
  const [cmd, a1, a2] = args;
  const home = homedir();
  const cwd = process.cwd();

  switch (cmd) {
    case "model": {
      if (!a1 || !(ROLES as readonly string[]).includes(a1)) fail(`unknown role "${a1 ?? ""}". Roles: ${ROLES.join(", ")}`, 2);
      const c = loadConfig({ home, cwd }).models[a1 as Role];
      console.log(c.effort ? `${c.model} ${c.effort}` : c.model);
      return;
    }
    case "get": {
      if (!a1) fail("usage: get <dotted.key>", 2);
      const v = getPath(loadConfig({ home, cwd }), a1);
      if (v === undefined) fail(`no such key "${a1}"`, 1);
      console.log(typeof v === "string" ? v : JSON.stringify(v));
      return;
    }
    case "set": {
      if (!a1 || a2 === undefined) fail("usage: set <dotted.key> <json> [--project]", 2);
      let value: unknown;
      try {
        value = JSON.parse(a2);
      } catch {
        fail(`value is not valid JSON: ${a2}`, 2);
      }
      const path = project ? projectConfigPath(cwd) : userConfigPath(home);
      const existing = readJsonObject(path, (m) => fail(m, 1)) ?? {};
      setPath(existing, a1, value);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
      return;
    }
    case "path":
      console.log(project ? projectConfigPath(cwd) : userConfigPath(home));
      return;
    default:
      fail("usage: config.ts model <role> | get <key> | set <key> <json> [--project] | path [--project]", 2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
