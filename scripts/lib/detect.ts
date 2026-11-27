import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Pack = "nuxt" | "node" | "bun";

type Obj = Record<string, unknown>;

const BUN_FILES = ["bun.lock", "bun.lockb", "bunfig.toml"];
const NUXT_CONFIGS = ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"];

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readPkg(dir: string): Obj | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Obj) : {};
  } catch {
    return {};
  }
}

function hasDep(pkg: Obj | null, names: string[]): boolean {
  if (!pkg) return false;
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg[field];
    if (typeof deps === "object" && deps !== null && names.some((n) => n in deps)) return true;
  }
  return false;
}

function hasBun(dir: string, pkg: Obj | null): boolean {
  return BUN_FILES.some((f) => existsSync(join(dir, f))) || hasDep(pkg, ["bun-types", "@types/bun"]);
}

function hasNuxt(dir: string, pkg: Obj | null): boolean {
  return hasDep(pkg, ["nuxt"]) || NUXT_CONFIGS.some((f) => existsSync(join(dir, f)));
}

function workspacePatterns(pkg: Obj | null): string[] {
  const ws = pkg?.workspaces;
  const list = Array.isArray(ws) ? ws : typeof ws === "object" && ws !== null ? (ws as Obj).packages : undefined;
  if (list === undefined) return ["apps/*", "packages/*"];
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

function expand(root: string, pattern: string): string[] {
  const p = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (p === "" || p.startsWith("/") || p.split("/").includes("..")) return [];
  if (!p.includes("*")) return isDir(join(root, p)) ? [join(root, p)] : [];
  const m = /^([^*/]+(?:\/[^*/]+)*)\/\*$/.exec(p);
  if (!m) return [];
  const base = join(root, m[1]!);
  if (!isDir(base)) return [];
  const out: string[] = [];
  try {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== "node_modules") out.push(join(base, e.name));
    }
  } catch {
    return [];
  }
  return out;
}

export function detectPacks(root: string): Pack[] {
  const packs = new Set<Pack>();
  const rootPkg = readPkg(root);
  const rootBun = hasBun(root, rootPkg);
  if (rootBun) packs.add("bun");
  if (rootPkg && !rootBun) packs.add("node");
  if (hasNuxt(root, rootPkg)) packs.add("nuxt");
  const dirs = new Set(workspacePatterns(rootPkg).flatMap((p) => expand(root, p)));
  for (const dir of dirs) {
    const pkg = readPkg(dir);
    if (hasBun(dir, pkg)) packs.add("bun");
    if (hasNuxt(dir, pkg)) packs.add("nuxt");
  }
  return [...packs].sort();
}
