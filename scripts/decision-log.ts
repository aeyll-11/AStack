import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const HEADER = "ts\tphase\tdecision\twhy\tevidence\tresult";

/** One-line cell; a leading `=`, `+`, `-`, or `@` gets a quote so spreadsheets don't run it. */
export function cleanCell(value: string): string {
  const flat = value.replace(/[\t\n\r]/g, " ");
  return /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
}

export function appendDecision(args: { file: string; cells: string[]; now: Date }): void {
  const { file, cells, now } = args;
  if (cells.length !== 5) throw new Error("need 5 cells: phase decision why evidence result");
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file) || statSync(file).size === 0) appendFileSync(file, `${HEADER}\n`);
  const ts = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  appendFileSync(file, `${[ts, ...cells.map(cleanCell)].join("\t")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...cells] = process.argv.slice(2);
  if (!file || cells.length !== 5) {
    process.stderr.write("usage: decision-log.ts <logfile> <phase> <decision> <why> <evidence> <result>\n");
    process.exit(1);
  }
  appendDecision({ file, cells, now: new Date() });
}
