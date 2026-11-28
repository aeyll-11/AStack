# Field test: ResonatorTest (2026-11-28)

The target repo is `aeyll-11/ResonatorTest`, a Node 24 + Express TS todos API, private, with CI. Resonator is the installed plugin `resonator@resonator` 0.1.0.

## Workflow issues

| # | Step | Symptom | Cause | Fix | Status |
|---|---|---|---|---|---|
| 1 | setup-resonator | It was invoked from the `~/AStack` session, so the project-scope writes (`.resonator/config.json`, `.claude/settings.json`) would land in the wrong repo. | The skill trusts `cwd` and never confirms the target repo. | Step 0: print `git rev-parse --show-toplevel` and the `origin` slug, and confirm with the user before any `--project` write. | open |
| 2 | setup-resonator, step 8 (narrow allowlist) | The narrow set has no rule for the generated driver CLI (`node .claude/skills/verify-*/scripts/*-cli.mjs`), so every verify run would prompt. | The narrow node rule covers only the plugin's own scripts. | Add `Bash(node .claude/skills/verify-*/scripts/*)` to both the narrow and broad sets. | open (added by hand in this run) |
| 3 | setup-resonator, step 8 | The narrow node rule hard-codes the plugin cache path, including the version `0.1.0`, so it breaks silently on a plugin upgrade. | The path is versioned under `~/.claude/plugins/cache/`. | Use a version-free form if Claude Code supports it, e.g. `${CLAUDE_PLUGIN_ROOT}`. Otherwise re-run step 8 on every upgrade, and have the SessionStart hook warn when the allowlist points at an older version. | open |
| 4 | setup-resonator, step 9 | `claude plugin list` output is multi-line per plugin and hard to parse. Here agent-skills was still enabled and superpowers already disabled. | No machine-readable output was used. | Use `claude plugin list --json` if it exists, otherwise parse `❯ name` + `Status:` pairs. | open |
| 5 | create-verification-skill (API-only app) | The skill and template are browser-first. The CLI had no `http` command, so the agent added one (14 lines). Step 4 demands a screenshot and snapshot, which cannot run. | The template and step 4 assume a UI surface. verify-web's `[http]` path uses curl outside the CLI. | Ship a first-class `http <METHOD> <route> [--json] [--expect] [--out]` command in the template. Make step 4 surface-aware: API apps prove with `http`, not screenshot or snapshot. Have verify-web route `[http]` criteria through `<app>-cli http`. | open |
| 6 | create-verification-skill | It says "ask the user once with AskUserQuestion" about installing Playwright, but worker.md says subagents never show a person a question. On an API there is nothing to install. | The skill text conflicts with worker.md, and the question isn't scoped to UI apps. | Skip the Playwright question when the app has no browser surface. When the skill runs inside a delegate, report it as a proposal instead of asking. | open |
| 7 | create-verification-skill | There is no guidance for an app without auth (`login` always fails, rc=2) or without pages (`rootMarker` must be set to `null`, undocumented). | The template assumes auth and pages. | Document `auth: null` / `rootMarker: null`. When auth is null, `login` prints `skip no auth` and exits 0, and step 4 skips it. | open |
| 8 | create-verification-skill | `Selectors:` and the Helpers rule ("list every command") make no sense for JSON. The map ended up listing 12 browser commands as "exit 3 here". | The feature-map header and Helpers rule are UI-only. | For APIs, `Selectors:` becomes `Contract:` (request and response fields, status codes). Helpers lists only the commands that apply to the surface. | open |
| 9 | maintain-verification-skill | The live pass is all browser steps (`open`, `click`, `fill`, `screenshot`). | Same UI-first assumption as #5. | Make the live pass surface-aware: APIs drive with `http`. | open |
| 10 | app-cli template | `doctor` prints the raw `seed.check` string with `{port}` unsubstituted. | Missing template substitution in the doctor output. | Substitute `{port}` before printing. | open |
| — | **Product bug found** in ResonatorTest | A malformed JSON body to `POST /todos` returns a 400 **HTML page with a full stack trace**, which leaks internals. | Express's default error handler. | Add a JSON error handler in `src/app.ts`. Good candidate for a Phoebe issue. | found by verification (not a Resonator bug) |

## Token usage (complexity vs consumption)

Measure tokens per step with `npm run usage -- --md --since <ISO> --until <ISO>` (reads `~/.claude/projects/<slug>/`, one row per agent plus a totals row; add `--by model` or `--json`).

Complexity scale: **S** is a config or doc change, **M** is one endpoint or feature with tests, **L** is a multi-file feature or several issues.

| Step | Complexity | Model(s) | Input tok | Output tok | Cache read | Tool calls | Wall time | Notes |
|---|---|---|---|---|---|---|---|---|
| setup-resonator | S | opus (lead), run inline in the controller session | n/a | n/a | n/a | ~14 | ~6 min (user answering) | 6 AskUserQuestion calls. Tokens are mixed into the controller session, so they can't be isolated. |
| create-verification-skill | M | opus high (xiangli-yao) | 28 | 19,705 | 978,807 (+102,486 write) | 24 | 2m 51s | 4 features mapped, CLI proved end to end, found 1 product bug. Total 1.10M, 89% cache read. |
| (tooling) usage script | S | sonnet medium | 18 | 11,129 | 412,042 (+59,271 write) | 10 | 1m 17s | Dev tooling, not a Resonator workflow step. Total 0.48M. |

### Usage findings

- **U1. Controller overhead dominates.** The controller session (this conversation) used 32.6M tokens in 30 minutes, 97% of it cache reads. Its long context is re-read on every turn. The workflow agents used about 1.6M combined over the same window. Fix: run Resonator in a fresh session per task, as a real user would. Keep orchestration sessions short and hand off through files (the ledger), not chat history.
- **U2. Cache read is about 90% of every agent's total,** even small ones. Each turn re-reads the skill files plus the growing tool results. Fix candidates: (a) keep skills short, since the router is already capped at 150 lines; (b) tell agents to read only the sections they need; (c) prefer `sonnet` for M-sized mechanical steps. Track whether output tokens, the real work, scale with complexity: S ≈ 11k, M ≈ 20k so far.

Numbers come from `scripts/dev/usage.ts`, which sums the `usage` fields in `~/.claude/projects/<slug>/<session>.jsonl` and its subagent logs.
