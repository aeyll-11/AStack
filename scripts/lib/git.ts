import { execFileSync } from "node:child_process";

export class GitHubUnavailable extends Error {
  constructor(reason: string) {
    super(`astack: GitHub unavailable: ${reason}`);
    this.name = "GitHubUnavailable";
  }
}

export function run(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const stderr = String(err.stderr ?? "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message || "unknown error"}`);
  }
}

export function repoSlug(cwd: string): { owner: string; repo: string } {
  let url: string;
  try {
    url = run("git", ["remote", "get-url", "origin"], cwd);
  } catch {
    throw new GitHubUnavailable("no origin remote");
  }
  const m =
    /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url) ??
    /^(?:ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url);
  if (!m) throw new GitHubUnavailable(`origin is not a GitHub remote (${url})`);
  return { owner: m[1], repo: m[2] };
}
