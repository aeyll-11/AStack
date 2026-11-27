import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs as parseArgv } from "node:util";
import { GitHubUnavailable } from "../lib/git.ts";
import {
  GhGitHubReader,
  WatcherQueryError,
  discoverStack,
  resolveContext,
} from "./github.ts";
import {
  readSnapshot,
  runQueued,
  runSimple,
  statusQueryVerdict,
  summarize,
  verdictFactory,
  type WatchClock,
} from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export interface CliOptions {
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
  readonly mode: T.WatchMode;
  readonly stackPrs: readonly T.PrNumber[];
  readonly statusOnly: boolean;
  readonly summary: boolean;
  readonly pretty: boolean;
  readonly polling: T.PollingOptions;
}
const HELP = `Usage: watch-pr [pr] [options]

Watch one pull request, a connected stack, or an immutable queued stack.
JSON (NDJSON while polling) is the default; --pretty renders human text.

Options:
  --owner <owner>             GitHub repository owner
  --repo <repo>               GitHub repository name
  --pr <number>               pull request number (or pass it as the first argument)
  --stack                     watch the connected open stack
  --queued-stack              watch the captured stack until all PRs merge
  --stack-prs <n,...>         frozen bottom-to-top queue (queued mode only)
  --interval <seconds>        poll interval (default: 60)
  --sweep-interval <seconds>  whole-stack sweep interval (default: 300)
  --timeout <seconds>         deadline; 0 disables it (default: 0)
  --max-query-errors <count>  consecutive query-error budget (default: 5)
  --status-only, --once       read once, print one status, and exit
  --json                      read one PR once and print
                              {"state","failing":[{"name","link"}],"unresolvedThreads"}
  --allow-draft               do not treat a draft as a merge gate
  --pretty                    render human text instead of JSON
  -h, --help                  show this help

Exit 2 with "astack: GitHub unavailable: <reason>" when gh is missing or unauthenticated.
`;
class UsageError extends Error {}
function invalid(flag: string, value: string, reason: string): never {
  throw new UsageError(
    `option '${flag}' argument '${value}' is invalid. ${reason}`
  );
}
function positiveNumber(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    invalid(flag, value, "must be greater than zero");
  return parsed;
}
function nonNegativeNumber(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    invalid(flag, value, "must be zero or greater");
  return parsed;
}
function positiveInteger(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    invalid(flag, value, "must be a positive integer");
  return parsed;
}
function prNumber(flag: string, value: string): T.PrNumber {
  try {
    return parsePrNumber(Number(value.trim().replace(/^#/, "")));
  } catch {
    return invalid(flag, value, "must be a positive integer");
  }
}
function stackPrList(value: string): T.NonEmpty<T.PrNumber> {
  const flag = "--stack-prs <n,...>";
  const numbers = value.split(",").map((part) => prNumber(flag, part));
  if (new Set(numbers).size !== numbers.length)
    invalid(flag, value, "contains a duplicate PR");
  const parsed = nonEmpty(numbers);
  if (parsed === null) return invalid(flag, value, "cannot be empty");
  return parsed;
}
export function parseArgs(argv: readonly string[]): CliOptions | "help" {
  let parsed;
  try {
    parsed = parseArgv({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        owner: { type: "string" },
        repo: { type: "string" },
        pr: { type: "string" },
        stack: { type: "boolean", default: false },
        "queued-stack": { type: "boolean", default: false },
        "stack-prs": { type: "string" },
        interval: { type: "string" },
        "sweep-interval": { type: "string" },
        timeout: { type: "string" },
        "max-query-errors": { type: "string" },
        "status-only": { type: "boolean", default: false },
        once: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        "allow-draft": { type: "boolean", default: false },
        pretty: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const raw = parsed.values;
  if (raw.help) return "help";
  if (parsed.positionals.length > 1)
    throw new UsageError(`too many arguments: ${parsed.positionals.join(" ")}`);
  const positional = parsed.positionals[0];
  if (positional !== undefined && raw.pr !== undefined)
    throw new UsageError("pass the PR number once, as an argument or --pr");
  const pr =
    raw.pr !== undefined
      ? prNumber("--pr <number>", raw.pr)
      : positional !== undefined
        ? prNumber("pr", positional)
        : null;
  if (raw.stack && raw["queued-stack"])
    throw new UsageError(
      "option '--stack' cannot be used with option '--queued-stack'"
    );
  if (raw["stack-prs"] !== undefined && !raw["queued-stack"])
    throw new UsageError("--stack-prs requires --queued-stack");
  if (raw.json && (raw.stack || raw["queued-stack"]))
    throw new UsageError("--json watches a single PR");
  const number = (
    key: "interval" | "sweep-interval" | "timeout" | "max-query-errors",
    flag: string,
    fallback: number,
    parse: (flag: string, value: string) => number
  ): number => {
    const value = raw[key];
    return value === undefined ? fallback : parse(flag, value);
  };
  return {
    owner: raw.owner ?? null,
    repo: raw.repo ?? null,
    pr,
    mode: raw["queued-stack"] ? "queued-stack" : raw.stack ? "stack" : "single",
    stackPrs:
      raw["stack-prs"] === undefined ? [] : stackPrList(raw["stack-prs"]),
    statusOnly: raw["status-only"] || raw.once || raw.json,
    summary: raw.json,
    pretty: raw.pretty,
    polling: {
      interval: number("interval", "--interval <seconds>", 60, positiveNumber),
      sweepInterval: number(
        "sweep-interval",
        "--sweep-interval <seconds>",
        300,
        positiveNumber
      ),
      timeout: number("timeout", "--timeout <seconds>", 0, nonNegativeNumber),
      maxQueryErrors: number(
        "max-query-errors",
        "--max-query-errors <count>",
        5,
        positiveInteger
      ),
      allowDraft: raw["allow-draft"],
    },
  };
}
export interface CliRuntime {
  readonly reader: T.GitHubReader;
  readonly clock: WatchClock;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}
function realRuntime(): CliRuntime {
  return {
    reader: new GhGitHubReader(),
    clock: {
      now: () => performance.now() / 1_000,
      observedAt: () => new Date().toISOString(),
      sleep: async (seconds) => {
        await delay(seconds * 1_000);
      },
    },
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}
export async function main(
  argv: readonly string[],
  runtime: CliRuntime = realRuntime()
): Promise<number> {
  let options: CliOptions | "help";
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    runtime.stderr(`error: ${error.message}\n`);
    return 64;
  }
  if (options === "help") {
    runtime.stdout(HELP);
    return 0;
  }
  try {
    return await watch(options, runtime);
  } catch (error) {
    if (!(error instanceof GitHubUnavailable)) throw error;
    runtime.stderr(`${error.message}\n`);
    return 2;
  }
}
async function watch(options: CliOptions, runtime: CliRuntime): Promise<number> {
  const render = options.pretty ? renderPretty : renderJson;
  const emit = (verdict: T.ProgressVerdict): void =>
    runtime.stdout(render(verdict));
  let contexts: T.NonEmpty<T.PrContext>;
  try {
    const seed = await resolveContext({
      reader: runtime.reader,
      owner: options.owner,
      repo: options.repo,
      pr: options.pr ?? options.stackPrs[0] ?? null,
    });
    if (options.summary) {
      const row = await readSnapshot({
        reader: runtime.reader,
        context: seed,
        pendingHistory: "include",
        allowDraft: options.polling.allowDraft,
      });
      runtime.stdout(`${JSON.stringify(summarize(row))}\n`);
      return 0;
    }
    contexts =
      nonEmpty(options.stackPrs.map((number) => ({ ...seed, number }))) ??
      (options.mode === "single"
        ? [seed]
        : await discoverStack(runtime.reader, seed));
  } catch (error) {
    if (!(error instanceof WatcherQueryError)) throw error;
    const verdict = statusQueryVerdict(
      verdictFactory(runtime.clock, options.mode),
      1,
      error.failure
    );
    if (options.summary) runtime.stderr(render(verdict));
    else runtime.stdout(render(verdict));
    return verdict.exitCode;
  }
  const dependencies = { reader: runtime.reader, clock: runtime.clock, emit };
  const verdict =
    options.mode === "queued-stack" && !options.statusOnly
      ? await runQueued({ dependencies, contexts, options: options.polling })
      : await runSimple({
          dependencies,
          contexts,
          mode: options.mode,
          statusOnly: options.statusOnly,
          options: options.polling,
        });
  runtime.stdout(render(verdict));
  return verdict.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2));
