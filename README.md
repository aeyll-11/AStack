# Resonator

Resonator is a Claude Code plugin for JS/TS web engineering. Give it a task or an issue queue. It returns pull requests that are verified against the running app, reviewed by Resonator itself, and green on CI. A human gets notified. Resonator never merges.

It is one plugin. It covers understanding the task, a short spec, design, implementation, tests, real-app verification, multi-angle review, fixes, the PR, the CI watch, and the notification.

## Install

```
/plugin marketplace add <path or repo>
/plugin install resonator@resonator
```

Resonator's router competes with other workflow plugins whose skills auto-trigger. `/resonator:setup-resonator` lists the ones you have enabled and gives the command to disable each.

## Get started

1. Run `/resonator:setup-resonator`. You pick the model and effort for each role, then set the issue source, notifications, dev server, router hook, and permission allowlist.
2. Run `/resonator:resonator <task>`. The router restates your goal, detects your stack packs, picks a playbook, and works it to a green PR.

Not sure which skill or playbook fits? Run `/resonator:resonator-help <question>`.

## The two workflows

**Spec to PR.** One task, one PR. The `feature` playbook runs it. A bug runs `verina`, a slow page runs `perf`, and so on.

```
PR slot -> spec -> architect -> implement (with tests) -> verify (real app)
  -> open draft PR -> self-review and fixes -> CI watch -> ready PR + human notified
```

**Phoebe, the issue loop.** A queue of GitHub or Linear issues. Phoebe claims each issue, gives it its own owner agent in its own worktree, and runs the feature pipeline per issue.

```
issues -> claim -> triage -> worktree slot -> phoebe-<n> owner agent
  -> sharpen -> implement -> verify -> review -> CI -> green PR "Closes #<n>"
```

An unclear issue gets one specific question and the `resonator:needs-info` label. Run Phoebe under `/loop` for a continuous queue. See `docs/guide/04-phoebe.md`.

## Never merges

The end state of every task is a green PR with a human notified. When CI is green, Resonator:

1. marks the draft PR ready,
2. requests review from `notify.reviewer` (or the repo owner),
3. posts a summary comment: what changed, how verified, review findings, CI result, what is left,
4. sends a Claude Code push notification, when `notify.push` is on.

When CI stays red past the retry bound, or the branch conflicts, the PR stays a draft. The summary comment names each failing check with its link, and you still get the notification. `/resonator:setup-resonator` also adds deny entries for PR merge and force-push to the project's `.claude/settings.json`.

## Playbooks

The router opens `skills/resonator/playbooks/<slug>.md` and copies its steps into the task list.

| Playbook | For |
|---|---|
| `feature` | A feature description to a green PR |
| `verina` | A bug: reproduce first, root-cause, fix, verify |
| `perf` | A slow page, endpoint, or build: baseline, fix, re-measure |
| `refactoring` | A behavior-preserving change |
| `investigation` | A read-only "how, why, or are we sure" question |
| `prototype` | A throwaway sketch to settle a design fork |
| `visual-parity` | UI that must match a reference image or another implementation |
| `phoebe` | The issue loop: work a GitHub or Linear queue |
| `babysit` | An existing PR to green: conflicts, review threads, CI |
| `opening-a-pr` | The shared tail of every code playbook: PR, self-review, CI, notify |
| `multi-phase-plan` | Work that spans several PRs |
| `session-pickup` | Resuming another session's work |
| `pause-safely` | Suspending work cleanly |
| `worktree-cleanup` | Pruning merged or abandoned worktrees |

Large or unattended work, or a task no playbook fits, goes to the `figure-it-out` skill.

## Skills

Type any skill as `/resonator:<name>`.

| Skill | What it does |
|---|---|
| `resonator` | The router. Picks a playbook and drives it |
| `resonator-help` | Answers "which skill or playbook do I use" |
| `setup-resonator` | Configures models, issue source, notifications, hook, allowlist |
| `spec` | Turns a request or issue into goal, checkable criteria, guesses, open questions |
| `sharpen` | Makes a task deeper, then rewrites the prompt |
| `in-your-own-words` | Restates the user's goal and problem |
| `architect` | Sketches types, signatures, and modules before code |
| `tdd` | Failing test first, when asked or cheap |
| `verify-web` | Proves each criterion against the running app |
| `create-verification-skill` | Generates a project verify skill: feature map plus `<app>-cli` driver |
| `maintain-verification-skill` | Daily pass that keeps the feature map and the CLI honest |
| `pr-review` | Parallel read-only reviewer panel; the lead verifies each finding |
| `shorekeeper` | Watches CI to green, fixes red runs within a retry bound |
| `no-comments` | Removes needless comments before commit |
| `unslop` | Cuts AI tells from prose |
| `technical-writing` | Standard for docs, PRs, and commit messages |
| `swarm` | Fans out parallel workers and returns one report |
| `arena` | Parallel candidates for one task, then grafts the best parts |
| `interrogate` | Adversarial multi-model review of a contested design |
| `blast-radius` | Finds what a change could break elsewhere |
| `benchmark-checklist` | Vets a measurement before you report it |
| `figure-it-out` | Designs an auditable playbook for large work |
| `show-me-your-work` | Keeps a decision log for unattended work |
| `how` | Code walkthroughs and placement questions |
| `why` | Design rationale and postmortems, with citations |
| `recall` | Rebuilds recent working context |
| `ketchup` | Catches you up on what changed in the chat |
| `reflect` | Turns transcript learnings into skill edits |
| `correct` | Makes repeated agent mistakes impossible, preferring structure over docs |
| `typescript-best-practices` | Applies whenever `.ts` or `.tsx` is touched |
| `pack-nuxt`, `pack-node`, `pack-bun` | Stack packs, see below |
| `principle-*` | 24 principles, see below |

## Agents

| Agent | Role |
|---|---|
| `xiangli-yao` | Implementer and default delegate. A fresh one per task |
| `review-correctness` | Reviewer seat: logic bugs, edge cases, races |
| `review-security` | Reviewer seat: authz, injection, XSS, secrets |
| `review-performance` | Reviewer seat: N+1, bundle size, blocking, leaks |
| `review-api` | Reviewer seat: contracts, validation, breaking changes |
| `zhezhi` | Reviewer seat: accessibility, states, responsive, layout shift |
| `comment-sicko` | Finds comments that should go; used by `no-comments` |

Reviewers are read-only. Each finding needs a concrete failure scenario. The roles in the cast are Jinhsi (the router), Phoebe (the issue loop), Shorekeeper (CI), Encore (the retry step inside Shorekeeper), Xiangli Yao (implementer), Verina (bug fix), and Zhezhi (frontend review).

## Principles

The router grounds each decision in a principle and names it in the reply. Each principle is a skill, `principle-<title>`.

- **Core:** laziness-protocol, foundational-thinking, redesign-from-first-principles, attack-the-premise, subtract-before-you-add, minimize-reader-load, outcome-oriented-execution, experience-first, exhaust-the-design-space, build-the-lever
- **Architecture:** model-the-domain, boundary-discipline, type-system-discipline, make-operations-idempotent, migrate-callers-then-delete-legacy-apis, separate-before-serializing-shared-state
- **Verification:** prove-it-works, fix-root-causes, sequence-verifiable-units, test-behavior-not-implementation, explain-the-number
- **Delegation:** guard-the-context-window, never-block-on-the-human
- **Meta:** encode-lessons-in-structure

## Stack packs

`node scripts/detect.ts` prints the active packs for the project. A step that touches framework or runtime code reads the matching skill.

| Pack | Applies to |
|---|---|
| `pack-nuxt` | Nuxt apps |
| `pack-node` | Node.js projects |
| `pack-bun` | Bun projects, including Elysia and Hono servers |

Packs combine. A Nuxt app on Bun gets `pack-nuxt` and `pack-bun`.

## Configuration

Two files. The project file overrides the user file. Missing keys use defaults.

- User: `~/.claude/resonator/config.json`
- Project: `.resonator/config.json`

| Key | Default | Meaning |
|---|---|---|
| `models.<role>` | per role | `{"model","effort"}`. Model is `opus`, `sonnet`, `haiku`, or `fable`. Effort is `low` to `max` |
| `routerHook` | `true` | A `SessionStart` pointer that routes non-trivial tasks through `/resonator:resonator` |
| `notify.push` | `true` | Send a push notification when a PR is ready or escalated |
| `notify.requestReview` | `true` | Request review when CI is green |
| `notify.reviewer` | unset | GitHub login to request. Falls back to the repo owner |
| `issues` | unset | `source` (`github` or `linear`), `labels`, `assignee`, `milestone`, `linearTeam` |
| `devServer` | unset | `command`, `basePort`, optional `readyPath` |
| `concurrency` | `2` | Phoebe owners running at once |
| `ciRetries` | `3` | Fix-and-push rounds before CI escalates |
| `dbPerSlot` | `false` | Reserved, no effect yet (slots share the local database) |
| `configured` | `false` | Set by `/resonator:setup-resonator` |

Roles: `lead`, `implementer`, `bugfix`, `mechanical`, `verify`, `review-correctness`, `review-security`, `review-performance`, `review-frontend`, `review-api`, `phoebe-owner`.

Read and write with the CLI:

```
node scripts/config.ts get <key>
node scripts/config.ts set <key> <json> [--project]
node scripts/config.ts model <role>
```

## Verify

`npm run verify` runs the tests, typecheck, lint, and plugin validation, smoke-runs every script CLI offline, and checks that every playbook, skill, agent, and model role reference resolves. It prints `PASS`, `FAIL`, or `SKIP` per check and exits 1 on any failure. `docs/plugin-map.md` lists each plugin feature and how it is proved. Features that need a live GitHub repo are in `docs/acceptance/`.

Your app is verified differently. `/resonator:create-verification-skill` writes a project skill at `.claude/skills/verify-<app>/` with two parts. A feature map (`features/`, one file per feature with its route, selectors, expected end state, and owning source files) that the agent reads instead of searching the code. A driver CLI (`scripts/<app>-cli.mjs`) that the agent calls instead of writing a browser script: `<app>-cli launch`, `login`, `open /notes`, `click button:Save`, `snapshot`, `screenshot --out`, `cleanup`. Waits, auth, seed, and cleanup live once in the CLI, on the project's own Playwright. The `verify-web` skill drives every browser criterion through it. `/resonator:maintain-verification-skill` keeps the map and the CLI honest; run it daily (`/resonator:setup-resonator` offers a `/loop` or a crontab line).

## Guide

Task-oriented pages are in [docs/guide](docs/guide/README.md).

## Credits

Resonator is modeled on and ports material from [PStack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, under the MIT License. See `NOTICE` and `LICENSE`.
