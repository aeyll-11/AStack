import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubUnavailable, repoSlug, run } from "./lib/git.ts";

const BRANCH = "astack-evidence";
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

function remoteHasBranch(cwd: string): boolean {
  return run("git", ["ls-remote", "--heads", "origin", BRANCH], cwd) !== "";
}

/** Commit files to pr-<n>/ on the orphan evidence branch through a temp worktree, push, and return markdown links. */
export function pushEvidence(opts: { cwd: string; pr: number; files: string[]; slug?: Slug }): string[] {
  const { cwd, pr } = opts;
  const slug = opts.slug ?? repoSlug(cwd);
  const files = opts.files.map((f) => resolve(cwd, f));
  for (const f of files) if (!existsSync(f)) throw new Error(`astack: no such file: ${f}`);

  const parent = mkdtempSync(join(tmpdir(), "astack-evidence-"));
  const wt = join(parent, "wt");
  let added = false;
  try {
    if (remoteHasBranch(cwd)) {
      run("git", ["fetch", "-q", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`], cwd);
      run("git", ["worktree", "add", "-q", "--detach", wt, `origin/${BRANCH}`], cwd);
      added = true;
    } else {
      run("git", ["worktree", "add", "-q", "--detach", wt], cwd);
      added = true;
      run("git", ["checkout", "-q", "--orphan", BRANCH], wt);
      run("git", ["rm", "-rfq", "--ignore-unmatch", "."], wt);
    }
    const dir = join(wt, `pr-${pr}`);
    mkdirSync(dir, { recursive: true });
    for (const f of files) copyFileSync(f, join(dir, basename(f)));
    run("git", ["add", "--", `pr-${pr}`], wt);
    if (run("git", ["status", "--porcelain"], wt) !== "") {
      run("git", ["commit", "-q", "-m", `evidence: pr-${pr}`], wt);
    }
    run("git", ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`], wt);
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
