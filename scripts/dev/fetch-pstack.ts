import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PSTACK_SHA = "b7b93c36be9bcc36a74db438e0fd385d660bc559";
const REPO = "cursor/plugins";
const ROOT = "pstack/";

export interface TreeEntry {
  path: string;
  type: string;
}

/** Map a git tree listing plus a prefix (relative to pstack/) to pstack-relative blob paths. */
export function pathsUnderPrefix(tree: TreeEntry[], prefix: string): string[] {
  const full = ROOT + prefix.replace(/^\/+/, "");
  return tree
    .filter((e) => e.type === "blob" && e.path.startsWith(full))
    .map((e) => e.path.slice(ROOT.length))
    .sort();
}

function gh(endpoint: string, jq: string): string {
  return execFileSync("gh", ["api", endpoint, "--jq", jq], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function fetchFile(path: string, outRoot: string): string {
  const b64 = gh(`repos/${REPO}/contents/pstack/${path}?ref=${PSTACK_SHA}`, ".content").replace(/\s+/g, "");
  const dest = join(outRoot, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(b64, "base64"));
  return dest;
}

function listTree(): TreeEntry[] {
  const out = gh(`repos/${REPO}/git/trees/${PSTACK_SHA}?recursive=1`, "[.tree[]|{path,type}]");
  return JSON.parse(out) as TreeEntry[];
}

function main(argv: string[]): void {
  const outRoot = join(process.cwd(), "vendor", "pstack");
  let paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tree") {
      const prefix = argv[++i];
      if (!prefix) throw new Error("--tree needs a prefix");
      paths.push(...pathsUnderPrefix(listTree(), prefix));
    } else paths.push(argv[i]);
  }
  if (paths.length === 0) throw new Error("usage: fetch-pstack.ts [--tree <prefix>] <path>...");
  for (const p of paths) console.log(fetchFile(p, outRoot));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
