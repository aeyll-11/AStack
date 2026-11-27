import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ModelAlias = "opus" | "sonnet" | "haiku" | "fable";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Role =
  | "lead"
  | "implementer"
  | "bugfix"
  | "mechanical"
  | "verify"
  | "review-correctness"
  | "review-security"
  | "review-performance"
  | "review-frontend"
  | "review-api"
  | "phoebe-owner";

export interface ModelChoice {
  model: ModelAlias;
  effort?: Effort;
}

export interface AStackConfig {
  models: Record<Role, ModelChoice>;
  routerHook: boolean;
  notify: { push: boolean; requestReview: boolean; reviewer?: string };
  issues?: { source: "github" | "linear"; labels?: string[]; assignee?: string; milestone?: string; linearTeam?: string };
  devServer?: { command: string; basePort: number; readyPath?: string };
  concurrency: number;
  ciRetries: number;
  dbPerSlot: boolean;
  configured: boolean;
}

export const ROLES: readonly Role[] = [
  "lead",
  "implementer",
  "bugfix",
  "mechanical",
  "verify",
  "review-correctness",
  "review-security",
  "review-performance",
  "review-frontend",
  "review-api",
  "phoebe-owner",
];

const MODELS: readonly string[] = ["opus", "sonnet", "haiku", "fable"];
const EFFORTS: readonly string[] = ["low", "medium", "high", "xhigh", "max"];

export const DEFAULTS: AStackConfig = {
  models: {
    lead: { model: "opus", effort: "high" },
    implementer: { model: "opus", effort: "high" },
    bugfix: { model: "opus", effort: "high" },
    mechanical: { model: "sonnet", effort: "medium" },
    verify: { model: "sonnet", effort: "medium" },
    "review-correctness": { model: "fable", effort: "high" },
    "review-security": { model: "opus", effort: "high" },
    "review-performance": { model: "sonnet", effort: "medium" },
    "review-frontend": { model: "sonnet", effort: "medium" },
    "review-api": { model: "opus", effort: "high" },
    "phoebe-owner": { model: "opus", effort: "high" },
  },
  routerHook: true,
  notify: { push: true, requestReview: true },
  concurrency: 2,
  ciRetries: 3,
  dbPerSlot: false,
  configured: false,
};

export function userConfigPath(home: string): string {
  return join(home, ".claude", "astack", "config.json");
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".astack", "config.json");
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a JSON object file. Returns null when missing or unusable (warns on the latter). */
export function readJsonObject(path: string, warn: (m: string) => void): Obj | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    warn(`cannot read ${path}: ${(e as Error).message}`);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObj(parsed)) return parsed;
    warn(`${path} is not a JSON object, ignoring`);
  } catch (e) {
    warn(`malformed JSON in ${path}, ignoring: ${(e as Error).message}`);
  }
  return null;
}

function mergeLayer(base: AStackConfig, layer: Obj, source: string, warn: (m: string) => void): AStackConfig {
  const out: AStackConfig = {
    ...base,
    models: { ...base.models },
    notify: { ...base.notify },
  };
  if (isObj(layer.models)) {
    for (const role of ROLES) {
      const v = layer.models[role];
      if (v === undefined) continue;
      const ok =
        isObj(v) &&
        typeof v.model === "string" &&
        MODELS.includes(v.model) &&
        (v.effort === undefined || (typeof v.effort === "string" && EFFORTS.includes(v.effort)));
      if (!ok) {
        warn(`invalid models.${role} in ${source}, using default for ${role}`);
        continue;
      }
      const choice = v as unknown as ModelChoice;
      out.models[role] = choice.effort === undefined ? { model: choice.model } : { model: choice.model, effort: choice.effort };
    }
  }
  if (isObj(layer.notify)) out.notify = { ...out.notify, ...(layer.notify as Partial<AStackConfig["notify"]>) };
  if (typeof layer.routerHook === "boolean") out.routerHook = layer.routerHook;
  if (typeof layer.concurrency === "number") out.concurrency = layer.concurrency;
  if (typeof layer.ciRetries === "number") out.ciRetries = layer.ciRetries;
  if (typeof layer.dbPerSlot === "boolean") out.dbPerSlot = layer.dbPerSlot;
  if (typeof layer.configured === "boolean") out.configured = layer.configured;
  if (isObj(layer.issues)) out.issues = layer.issues as unknown as NonNullable<AStackConfig["issues"]>;
  if (isObj(layer.devServer)) out.devServer = layer.devServer as unknown as NonNullable<AStackConfig["devServer"]>;
  return out;
}

export function loadConfig(opts: { home: string; cwd: string; warn?: (m: string) => void }): AStackConfig {
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`astack: ${m}\n`));
  let cfg: AStackConfig = DEFAULTS;
  for (const path of [userConfigPath(opts.home), projectConfigPath(opts.cwd)]) {
    const layer = readJsonObject(path, warn);
    if (layer) cfg = mergeLayer(cfg, layer, path, warn);
  }
  return structuredClone(cfg);
}
