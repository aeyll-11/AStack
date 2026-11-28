> Historical: written when the plugin was named AStack; it is now Resonator.

# AStack — design

Date: 2026-11-27
Status: approved 2026-11-27

## 1. Intent

AStack is a Claude Code plugin that turns Claude into a disciplined web engineering team for JavaScript/TypeScript projects (Node, Bun, browser, full-stack frameworks). The goal is to ship high-quality backend and frontend code every day: less code, better code, verified against the real running app, reviewed before a human ever looks at it.

It is modeled on [PStack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, by Lauren Tan): a router skill that matches each task to a playbook, a set of one-rule principle skills, and focused helper skills and subagents. AStack keeps PStack's workflow and thinking, removes everything Cursor-specific and everything not about web work, and adds web-specific workflows, reviewers, and stack packs.

**Why:** the user wants one plugin that owns the whole daily loop — from a spec or an issue to a green, self-reviewed PR — instead of stitching together several general-purpose plugins (superpowers, agent-skills).

## 2. Goals

1. **One plugin.** AStack is the only workflow plugin the user needs installed. It must cover: understanding a task, sharpening a spec, design, implementation, testing, real-app verification, multi-angle review, fixing findings, PR, CI watch, human notification.
2. **Two primary workflows** (detailed in §5):
   - **Spec → PR**: user gives a feature description; AStack takes it to a green PR.
   - **Phoebe (issue loop)**: AStack pulls tasks from GitHub Issues or Linear and runs the same pipeline on each.
3. **Generic core, stack-specific packs.** The core works in any JS/TS web repo. Stack packs add framework/runtime knowledge. First packs: **Nuxt**, **Node**, **Bun**.
4. **Claude Code native.** Uses Claude Code primitives: skills, subagents (`agents/`), slash commands, hooks, git worktrees, `PushNotification`, background agents, `/loop`.
5. **Never merges.** The end state of every task is a green PR, reviewed by AStack, with a human notified.

## 3. Non-goals

- Supporting Cursor, Codex, or any harness other than Claude Code.
- Multi-vendor model panels (Gemini/GPT). Diversity comes from separate Claude subagents with different briefs, not different vendors.
- Non-web domains: iOS/Android, formal verification (TLA+), video generation, bot UIs.
- Auto-merge or deploy.
- Being tied to the author's own stack. Nuxt/Node/Bun are the first packs, not assumptions baked into the core.

## 4. Anti-goals (failure even if it "works")

- **Slop throughput.** More lines, more abstractions, more files than the task needs. AStack's success is measured by smaller, verified diffs.
- **Proxy verification.** "Tests pass" or "it compiles" claimed as done without exercising the real feature (browser or HTTP).
- **Review theatre.** Reviewer agents producing long lists of speculative findings that get "fixed" blindly. Only findings with a concrete failure scenario get acted on.
- **Cursor residue.** Any reference to Cursor-only tools (`generalPurpose`, Bugbot, `.mdc` rules, `cursor-team-kit`, `control-ui`, model slugs like `gemini-*`) in the shipped plugin.
- **Prompt sprawl.** A router that loads 60 files per task. Context stays lean: router + one playbook + only the principles/skills the steps call.

## 5. The workflows

### 5.1 Spec → PR (primary)

```
spec ─▶ sharpen ─▶ architect ─▶ implement ─▶ test ─▶ verify (real app) ─▶ open PR
                                                                            │
   notify human ◀── CI green ◀── fix findings ◀── self PR review ◀──────────┘
                       │  CI red → fix → push → wait again
```

1. **Sharpen.** Read the codebase, restate the goal, fill gaps, write a short spec with acceptance criteria into the PR branch (`docs/specs/` or the PR body — builder's call). **No human gate here (user decision):** AStack keeps going with labeled guesses and lists open questions in the PR body. It stops only when an unknown would change the whole feature (e.g. two incompatible readings of the spec).
2. **Architect.** Name the data shape, types, and module boundaries before writing logic (PStack `architect`).
3. **Implement.** Delegated to the implementer subagent (`xiangli-yao`) in its own worktree, small ordered commits.
4. **Test.** TDD where cheap. Tests assert observable behavior (principle: test behavior not implementation).
5. **Verify.** Exercise the real app: backend via HTTP against a running server, frontend via a real browser (Playwright, or Claude in Chrome when present). Evidence (request/response, screenshot, console log) is captured for the PR.
6. **Open PR as draft.** Conventional-commit title, briefing-style body: Why, What changed, How verified (with evidence), Open questions. Evidence: text (requests/responses, console output, test output) inline in the body; images and Playwright traces pushed to an orphan `astack-evidence` branch and linked with `blob/...?raw=true` URLs so they render for logged-in viewers without inflating the feature diff. *(builder-check call)*
7. **Self PR review.** Parallel reviewer subagents (§7.2) read the diff. Each finding needs a concrete failure scenario; the lead verifies each before fixing. Result posted as **one** summary comment (found / fixed / rejected with reason), not inline threads. *(builder-check call)*
8. **Fix findings**, push.
9. **CI watch** (`shorekeeper`). Poll the PR checks; on red, run **Encore**: diagnose root cause, fix, push, watch again. Bounded retries (builder's call on number; suggested 3) before escalating to the human.
10. **Notify.** When green: mark the PR ready for review, request the human's review, post a summary comment (what changed, how verified, what's left), send a Claude Code `PushNotification`.

### 5.2 Phoebe — the issue loop

The issue loop is named **Phoebe** (after the Wuthering Waves character). Playbook slug: `phoebe`; invoked as `/astack phoebe` or by asking AStack to work the issue queue. The name is used internally only; if AStack is published publicly, keep the character name out of the plugin's public name (Kuro Games IP).

Same pipeline, with the issue as the spec. Source adapters:

- **GitHub Issues** via `gh` (filter by label/assignee/milestone, configurable).
- **Linear** via the Linear MCP server (when connected).

Per issue: claim it (assign/label/status "in progress"), create a branch + git worktree, run §5.1, link the PR back to the issue, comment progress. Issues that are unclear get a comment asking the question and are skipped, not guessed. The loop runs under Claude Code `/loop` (self-paced) or a single pass over a queue. Concurrency: one owner subagent per issue; parallelism bounded (builder's call, suggested 2–3).

**Where it runs (user decision):** a local, interactive Claude Code session on the user's machine. No cloud, no bypass-permissions mode. `setup-astack` writes a project permission allowlist (git, `gh`, the package manager, dev server, Playwright) so the loop does not stall on prompts.

**Visibility (user requirement):** the user must be able to see what Phoebe is working on at any moment, and with several issues in flight, see several agents working, not one opaque process. Design:
- One **named background agent per issue** (name = `phoebe-<issue-number>`), so each shows up separately in Claude Code's agent/task view and can be opened, messaged, or stopped individually.
- A **task list entry per issue** (TaskCreate/TaskUpdate) with its current pipeline step (sharpen / implement / verify / review / CI / done / skipped).
- Phoebe posts a short status table in the main chat at each tick (issue, agent, step, PR link, CI state).
- Progress comments on the issue itself (claimed, PR opened, green).

**Worktree runtime** *(builder-check call)*: each worktree gets `node_modules` installed, gitignored `.env*` files copied (local only, never committed), and its own dev-server port (base port + slot). The local database is shared by default; a per-project config flag can point each slot at its own DB/schema when migrations conflict.

### 5.3 Other playbooks

Routed by the same entry point; mostly ported from PStack:

| Playbook | For |
|---|---|
| feature | the core of §5.1 |
| verina | bug fix: reproduce first (failing test or browser/HTTP repro), root-cause, fix, verify |
| perf | measure baseline (Node `--cpu-prof`, Chrome trace, Lighthouse/Web Vitals, heap snapshot), fix, re-measure; absorbs PStack runtime/trace forensics |
| refactoring | behavior-preserving change |
| investigation | read-only "how / why / are we sure" |
| prototype | throwaway sketch to settle a design fork |
| visual-parity | UI must match a reference image or another implementation |
| phoebe | the issue loop, §5.2 |
| babysit | drive an existing PR to green: conflicts, review threads, CI |
| opening-a-pr | shared tail of every code playbook (steps 6–10 of §5.1) |
| multi-phase-plan | work spanning several PRs |
| session-pickup | resume another session's work |
| pause-safely | suspend work cleanly |
| worktree-cleanup | prune merged/abandoned worktrees (no iOS simulator part) |

Dropped from PStack: hillclimb, eval, authoring-a-skill, autopilot-full/stack (replaced by phoebe, the issue loop), shipping (AStack never merges), runtime-forensics and trace-forensics (folded into perf/verina).

## 6. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Fork PStack, edit in place | Fastest; Cursor assumptions are spread through every file and leftovers would mislead agents. |
| B | Write from scratch, PStack as reference | Cleanest, most work, re-learns lessons PStack encodes. |
| **C (chosen)** | **Hybrid**: port language-agnostic parts nearly verbatim, rewrite the router, playbooks, spec/issue flow, reviewers, and stack packs for Claude Code + web | Keeps PStack's best thinking; the differentiating parts are native. Cost: one final consistency pass over tone. |

User chose C, with all Cursor support dropped.

## 7. Components

### 7.1 Skills

**Entry & help**
- `astack` — the router, persona **Jinhsi** (port of `poteto-mode`). `disable-model-invocation: true`. Non-negotiables, principle index, autonomy rules, subagent rules, playbook list. Playbooks live in `skills/astack/playbooks/*.md`; a `worker.md` that every spawned agent reads first.
- **It is a mode, not a skill library (user requirement).** The user's main experience is the `poteto-mode` one: type `/astack:astack <task>` and the router picks the playbook and drives everything; helper skills are called by playbook steps, rarely by hand. To keep it on across turns (Claude Code has no Cursor-style custom mode), a `SessionStart` hook — on by default, toggled in `setup-astack` — injects a short pointer telling Claude to route every non-trivial task through the router.
- **Sole plugin:** `setup-astack` detects overlapping workflow plugins (superpowers, agent-skills, others with auto-triggering process skills) and tells the user to disable them, since their auto-triggers would compete with AStack's playbooks.
- `astack-help` — which skill/playbook fits, hands back a prompt to type.
- `setup-astack` — detect stack packs, configure issue source (GitHub filter / Linear team), notification preferences, model per role (Claude models only), writes config (§8).

**New in AStack**
- `spec` — sharpen a feature description into goal + acceptance criteria + open questions.
- `verify-web` — prove behavior against the real app: start dev server, drive browser or HTTP, capture evidence. Uses the project-local verify skill if one exists.
- `create-verification-skill` / `maintain-verification-skill` — ported; generate a project-local verify skill with a feature map, web-focused (dev server command, routes, auth fixtures, seed data).
- `pr-review` — orchestrates the reviewer agents (§7.2) on a diff, dedupes, verifies findings.
- `shorekeeper` — the CI watcher: poll CI and review threads until green/red, run Encore on red; port PStack's `scripts/watch-pr` (TypeScript, Bun) adapted to Claude Code.

**Ported from PStack (Cursor references removed, examples made web-flavored)**
`architect`, `tdd`, `interrogate` (Claude-only panel), `swarm`, `arena`, `blast-radius`, `how`, `why`, `sharpen`, `in-your-own-words`, `figure-it-out`, `no-comments`, `unslop`, `technical-writing`, `reflect`, `correct`, `benchmark-checklist`, `typescript-best-practices`, `show-me-your-work`, `recall`, `ketchup`.

**Principles** — all 24 PStack principle skills, ported. Language-agnostic; examples may be swapped to web cases.

**Dropped:** `ketchup-video`, `make-bot-ui`, `statechart`, `create-/maintain-formal-verification-skill`, `reframe`, `bro`, `automate-me`, `teach`, benny automation, Bugbot triage reference.

### 7.2 Subagents (`agents/`)

- `xiangli-yao` — default delegate and implementer; reads `worker.md` + router before work (port of `poteto-agent`).
- `comment-sicko` — ported comment reviewer.
- Reviewers used by `pr-review` (read-only): `review-correctness`, `review-security` (authz, injection, secrets, SSRF, unsafe deserialization, OWASP-for-web), `review-performance` (N+1, bundle size, hydration/SSR cost, blocking I/O), `zhezhi` (frontend reviewer: a11y, UX states: loading/empty/error, responsive), `review-api` (contracts, validation at boundaries, error shapes, backwards compat).

### 7.3 Stack packs

A pack is a set of skills under `skills/pack-<name>-*` plus a detection rule. The router runs detection once per task (read `package.json`, lockfiles, config files) and loads only matching packs' skills into the steps that need them.

| Pack | Detect | Contents (first version) |
|---|---|---|
| Nuxt | `nuxt` dep or `nuxt.config.*` | Nuxt conventions (server routes, `useFetch`/`$fetch`, composables, auto-imports, Nitro), SSR/hydration pitfalls, Nuxt testing (`@nuxt/test-utils`, Playwright), dev-server verification recipe |
| Node | `engines.node`, `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`, no Bun markers | runtime best practices (async errors, streams, graceful shutdown, env/config parsing), `node:test`/Vitest, profiling recipes |
| Bun | `bun.lock`/`bun.lockb`, `bunfig.toml`, `bun-types` | Bun runtime APIs, `bun test`, Bun-vs-Node gotchas, Elysia/Hono notes |

Packs are additive: a Nuxt app on Bun loads both. More packs (Next, React+Vite, Hono, Express, Prisma, Drizzle) can be added later with the same structure.

### 7.4 Hooks

Minimal by default. Candidates (builder decides which earn their place): a `SessionStart` hook that runs stack detection and injects the active packs; a `Stop`/notification hook for Phoebe (the issue loop). No hooks that block normal editing.

### 7.5 Cast (naming)

Internal roles are named after Wuthering Waves characters. The plugin itself stays **AStack**; character names are used internally only (Kuro Games IP), so keep them out of any public plugin name.

| Role | Name | Slug | Why |
|---|---|---|---|
| Router / lead | Jinhsi | `astack` (entry point unchanged) | the Magistrate: governs and delegates |
| Issue loop | Phoebe | `phoebe` | works through the issue queue, §5.2 |
| CI watcher | Shorekeeper | `shorekeeper` | watches over the PR until green; never merges |
| CI retry on red | Encore | step inside `shorekeeper` | "one more time": fix, push, watch again |
| Implementer | Xiangli Yao | `xiangli-yao` | the engineer-researcher who builds |
| Bug fix | Verina | `verina` | the healer |
| Frontend reviewer | Zhezhi | `zhezhi` | the painter: UI, a11y, visual states |

Skills and agents not in this table keep descriptive names.

## 8. Configuration

Per user: `~/.claude/astack/config.json` (models per role, notification prefs). Per project: `.astack/config.json` (issue source + filter, dev server command, verify skill path, concurrency, CI retry limit). Every skill falls back to defaults when config is absent. Exact schema is the builder's call.

**Models are the user's choice (user decision).** `setup-astack` asks the user to pick a model for each role: router/lead, implementer (Xiangli Yao), bug fix (Verina), mechanical edits, verification, each reviewer seat on the `pr-review` panel, and Phoebe's per-issue owners. It shows the Claude models available in their account and a suggested default for each role. The answers go in `~/.claude/astack/config.json`, with an optional per-project override in `.astack/config.json`. Every skill reads that config and passes the chosen model when it spawns an agent. It never hard-codes a model.

- Suggested defaults, used only until the user runs setup: code/judgment `opus`; mechanical edits and verification `sonnet`; reviewer panel `fable` + `opus` + `sonnet`.
- The user can change any role at any time by rerunning `setup-astack` or editing the file.
- Constraint: the Agent tool's `model` parameter takes aliases (`opus`, `sonnet`, `haiku`, `fable`), so the choice is per family. If the user asks to pin an exact version, setup writes it into the matching agent file's frontmatter, and the builder must check that works.

## 9. Constraints

- Claude Code plugin format: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `agents/*.md`, optional `commands/`, `hooks/hooks.json`; plus a `.claude-plugin/marketplace.json` so it installs with `/plugin marketplace add` + `/plugin install astack@astack`.
- Repository: `/Users/aeyll/AStack`. MIT license with attribution to PStack's author for ported content.
- Skill names are prefixed by Claude Code as `astack:<name>`; docs and cross-references must use the prefixed form where invoked.
- Must work without Linear MCP, without Playwright installed, and without a GitHub remote (degrades with a one-line note, like PStack's harness adapter).
- Router context budget: the router file plus one playbook should stay small (target: router ≤ ~150 lines, each playbook ≤ ~60 lines).

## 10. Decided by the user

- Standalone: AStack replaces superpowers/agent-skills as the only workflow plugin.
- Generic JS/TS web core; first stack packs Nuxt, Node, Bun.
- Two primary workflows: spec → PR, Phoebe, the issue loop (GitHub Issues / Linear).
- End of every task: open PR → self PR review → fix → CI green → notify human. Never merge.
- Approach C, Claude Code only, no Cursor.
- Keep PStack's workflow, drop non-web skills.
- Spec → PR does not pause after sharpening; open questions go in the PR.
- Phoebe runs locally, interactively, with each issue visible as its own agent.
- Ship everything in the first release (all playbooks, ported skills, three packs), with the `/astack` router as the primary interface — a mode, like `poteto-mode`, not a loose bag of skills.
- Cast names from Wuthering Waves for internal roles (§7.5).

## 11. Left to the builder

- Exact wording of ported skills, as long as Cursor residue is gone and examples are web-flavored.
- Config schemas, CI retry count, Phoebe (issue-loop) concurrency default.
- Which hooks ship in v1.
- Whether `shorekeeper` stays a Bun/TS script or becomes a skill driving `gh` directly.
- Pack skill granularity (one skill per pack vs several).
- A README and short guide modeled on PStack's.
- A lint script that fails if any shipped file mentions Cursor-only terms (encodes anti-goal "Cursor residue").

## 12. Definition of done *(builder-check call)*

- Plugin installs from its marketplace file and `/astack:astack` loads.
- Cursor-residue lint passes; every skill/agent frontmatter is valid.
- End-to-end on a small fixture repo (Nuxt + Bun, with a GitHub remote): one spec runs to a green draft→ready PR with self-review comment and notification; Phoebe works two labeled issues in parallel, each visible as its own agent, both ending in green PRs.
