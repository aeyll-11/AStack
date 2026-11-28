import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubUnavailable, repoSlug, run } from "./lib/git.ts";

const BRANCH = "resonator-evidence";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

export interface Slug {
  owner: string;
  repo: string;
}

export function evidenceUrl(slug: Slug, pr: number, file: string): string {
  return `https://github.com/${slug.owner}/${slug.repo}/blob/${BRANCH}/pr-${pr}/${basename(file)}?raw=true`;
}

export function evidenceLink(slug: Slug, pr: number, file: string): string {
  const name = basename(file);
  const link = `[${name}](${evidenceUrl(slug, pr, file)})`;
  return IMAGE_EXT.has(extname(name).toLowerCase()) ? `!${link}` : link;
}

const ATTEMPTS = 3;

/** Fetch the remote evidence tip into refs/remotes/origin/<branch>; null when the remote has no such branch. */
function fetchTip(cwd: string): string | null {
  const line = run("git", ["ls-remote", "--heads", "origin", BRANCH], cwd);
  if (line === "") return null;
  run("git", ["fetch", "-q", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`], cwd);
  return run("git", ["rev-parse", `refs/remotes/origin/${BRANCH}`], cwd);
}

function remoteMoved(cwd: string, base: string | null): boolean {
  try {
    return fetchTip(cwd) !== base;
  } catch {
    return false;
  }
}

/**
 * Commit files to pr-<n>/ on the orphan evidence branch and push, returning markdown links.
 * Commits are built with plumbing in a detached temp worktree, so no local branch is ever created.
 * A push that loses a race is retried on the fresh remote tip.
 */
export function pushEvidence(opts: { cwd: string; pr: number; files: string[]; slug?: Slug }): string[] {
  const { cwd, pr } = opts;
  const slug = opts.slug ?? repoSlug(cwd);
  const files = opts.files.map((f) => resolve(cwd, f));
  for (const f of files) if (!existsSync(f)) throw new Error(`resonator: no such file: ${f}`);

  const parent = mkdtempSync(join(tmpdir(), "resonator-evidence-"));
  const wt = join(parent, "wt");
  let added = false;
  try {
    run("git", ["worktree", "add", "-q", "--detach", "--no-checkout", wt], cwd);
    added = true;
    const dir = join(wt, `pr-${pr}`);
    mkdirSync(dir, { recursive: true });
    for (const f of files) copyFileSync(f, join(dir, basename(f)));

    for (let attempt = 1; ; attempt++) {
      const base = fetchTip(cwd);
      run("git", base ? ["read-tree", base] : ["read-tree", "--empty"], wt);
      run("git", ["add", "-f", "--", `pr-${pr}`], wt);
      const tree = run("git", ["write-tree"], wt);
      if (base && tree === run("git", ["rev-parse", `${base}^{tree}`], wt)) break;
      const msg = `evidence: pr-${pr}`;
      const commit = run("git", ["commit-tree", tree, ...(base ? ["-p", base] : []), "-m", msg], wt);
      try {
        run("git", ["push", "-q", "origin", `${commit}:refs/heads/${BRANCH}`], wt);
        break;
      } catch (e) {
        if (attempt >= ATTEMPTS || !remoteMoved(cwd, base)) throw e;
      }
    }
  } finally {
    if (added) {
      try {
        run("git", ["worktree", "remove", "--force", wt], cwd);
      } catch {
        run("git", ["worktree", "prune"], cwd);
      }
    }
    rmSync(parent, { recursive: true, force: true });
  }
  return files.map((f) => evidenceLink(slug, pr, f));
}

const USAGE = "usage: evidence.ts push --pr <n> <files...>";

export function main(argv: string[]): void {
  try {
    const [cmd, ...rest] = argv;
    if (cmd !== "push") throw new Error(USAGE);
    const i = rest.indexOf("--pr");
    const pr = i >= 0 ? Number(rest[i + 1]) : NaN;
    if (!Number.isInteger(pr) || pr <= 0) throw new Error(USAGE);
    const files = rest.filter((_, j) => j !== i && j !== i + 1);
    if (files.length === 0) throw new Error(USAGE);
    for (const line of pushEvidence({ cwd: process.cwd(), pr, files })) process.stdout.write(line + "\n");
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(e instanceof GitHubUnavailable ? 2 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
