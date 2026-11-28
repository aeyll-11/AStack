import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { detectPacks } from "./lib/detect.ts";

export function main(argv: string[]): void {
  console.log(JSON.stringify(detectPacks(resolve(argv[0] ?? process.cwd()))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
