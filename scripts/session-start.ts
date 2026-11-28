import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "./lib/config.ts";
import type { ResonatorConfig } from "./lib/config.ts";
import { detectPacks } from "./lib/detect.ts";
import type { Pack } from "./lib/detect.ts";

const ROUTER = fileURLToPath(new URL("../skills/resonator/SKILL.md", import.meta.url));

export function buildContext(packs: Pack[], cfg: ResonatorConfig): string | null {
  const list = packs.length > 0 ? packs.join(", ") : "none";
  if (!cfg.routerHook) return packs.length > 0 ? `Resonator stack packs: ${list}.` : null;
  let text = `Resonator is active. Route every non-trivial engineering task through the /resonator:resonator router: Read ${ROUTER}, pick the playbook, follow it. Active stack packs: ${list}.`;
  if (!cfg.configured) text += " Resonator is not configured yet: suggest /resonator:setup-resonator once.";
  return text;
}

function readCwd(): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(0, "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      const c = (parsed as { cwd?: unknown }).cwd;
      if (typeof c === "string" && c.length > 0) return c;
    }
  } catch {
    // malformed or missing stdin: fall back below
  }
  return process.cwd();
}

export function main(): void {
  try {
    const cwd = readCwd();
    const cfg = loadConfig({ home: homedir(), cwd, warn: (m) => process.stderr.write(`resonator: ${m}\n`) });
    const context = buildContext(detectPacks(cwd), cfg);
    if (context !== null) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }) + "\n",
      );
    }
  } catch (e) {
    process.stderr.write(`resonator: session-start failed: ${e instanceof Error ? e.message : String(e)}\n`);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
