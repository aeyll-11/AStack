// Renames the plugin from AStack to Resonator: git mv of paths, then exact content replacements.
// Rerunnable: prints every file it changed (nothing when already renamed).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Ordered: specific forms first, generic last. Each applies to every occurrence.
export const MAPPING: ReadonlyArray<readonly [string, string]> = [
  ["/astack:astack", "/resonator:resonator"],
  ["name: astack", "name: resonator"],
  ["astack@astack", "resonator@resonator"],
  ["setup-astack", "setup-resonator"],
  ["astack-help", "resonator-help"],
  ["astack-evidence", "resonator-evidence"],
  ["astack:in-progress", "resonator:in-progress"],
  ["astack:needs-info", "resonator:needs-info"],
  ["astack:", "resonator:"],
  ["~/.claude/astack/", "~/.claude/resonator/"],
  [".astack/", ".resonator/"],
  ["ASTACK_", "RESONATOR_"],
  ["AStackConfig", "ResonatorConfig"],
  ["AStack", "Resonator"],
  ["Astack", "Resonator"],
  ["ASTACK", "RESONATOR"],
  ["astack", "resonator"],
];

const HISTORICAL = [
  "docs/specs/2026-11-27-astack-design.md",
  "docs/plans/2026-11-27-astack.md",
  "docs/acceptance/2026-11-27-e2e.md",
];
const NOTE = "> Historical: written when the plugin was named AStack; it is now Resonator.";
const SKIP = (p: string) =>
  p === "scripts/dev/rename.ts" ||
  p === "package-lock.json" ||
  p === "NOTICE" ||
  HISTORICAL.includes(p) ||
  p.startsWith(".superpowers/") ||
  p.startsWith("vendor/") ||
  p.startsWith("tests/fixtures/lint/dirty/old-name/");

export function applyMapping(text: string): string {
  let out = text;
  for (const [from, to] of MAPPING) out = out.split(from).join(to);
  return out;
}

function main(root: string): void {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
  const list = () => git("ls-files", "-z").split("\0").filter(Boolean);
  const changed: string[] = [];

  for (const p of list()) {
    if (SKIP(p) || !/astack/i.test(p)) continue;
    const to = applyMapping(p);
    mkdirSync(dirname(join(root, to)), { recursive: true });
    git("mv", p, to);
    changed.push(`${p} -> ${to}`);
  }

  for (const p of list()) {
    if (SKIP(p)) continue;
    const abs = join(root, p);
    const before = readFileSync(abs, "utf8");
    const after = applyMapping(before);
    if (after !== before) {
      writeFileSync(abs, after);
      changed.push(p);
    }
  }

  const edit = (p: string, f: (t: string) => string) => {
    const abs = join(root, p);
    const before = readFileSync(abs, "utf8");
    const after = f(before);
    if (after !== before) {
      writeFileSync(abs, after);
      changed.push(p);
    }
  };
  edit("NOTICE", (t) => t.replace(/^AStack is modeled/, "Resonator is modeled"));
  edit("package-lock.json", (t) => t.split('"name": "astack"').join('"name": "resonator"'));
  for (const p of HISTORICAL) edit(p, (t) => (t.startsWith(NOTE) ? t : `${NOTE}\n\n${t}`));

  for (const c of changed) console.log(c);
  console.log(`${changed.length} changes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(fileURLToPath(new URL("../../", import.meta.url)));
}
