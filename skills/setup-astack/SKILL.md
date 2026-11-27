---
name: setup-astack
description: Configure AStack. The user picks the model and effort for each role, then sets the issue source, notifications, dev server, router hook, and permission allowlist. Use for /astack:setup-astack, "set up astack", or "change my astack models".
---

# Setup AStack

Walk the user through AStack's configuration. **The user chooses every model. You never pick one for them.** The only exception is an explicit "use suggested for all remaining" answer. Re-running this skill is how the user changes anything later, so show each current value as the default.

`<plugin root>` is two levels above this skill's folder. Config goes through `node <plugin root>/scripts/config.ts`:

- `set <key> <json>` writes the user file (`~/.claude/astack/config.json`). Add `--project` for the project file (`.astack/config.json`).
- `get <key>` prints the current value and exits 1 when unset. `path [--project]` prints a file path.
- `model <role>` prints `<model> <effort>` for a role.

**Headless.** If AskUserQuestion is not available (for example `claude -p`), print every question below as plain text with its options and current value, say that setup needs an interactive session, and stop. Write nothing.

Ask with AskUserQuestion. A call takes at most 4 questions and each question takes 2 to 4 options, so batch in groups of up to 4. The built-in "Other" choice carries free text. Never write a value the user didn't give.

## 1. Detect packs

Run `node <plugin root>/scripts/detect.ts`. It prints a JSON array such as `["nuxt","node"]`. Show the packs, or say none were detected. They need no answer. The router reads the matching **pack-<p>** skill for each one.

## 2. Models and effort

Models are per family: `opus`, `sonnet`, `haiku`, `fable`. The Agent tool takes families only, so say that once up front.

For each role below, ask one question. Name the role and its job in one short line. Options are the four models. Put the role's current value first and mark it "(suggested)" when no user value is set, or "(current)" when one is. Read the current value with `config.ts model <role>`. The suggested defaults are what `config.ts model <role>` prints before the first run.

| Role | What it does |
|---|---|
| `lead` | The router: plans, routes, writes prose and judgment calls. |
| `implementer` | Writes code in the feature, refactor, and perf playbooks. |
| `bugfix` | Writes code in the bug-fix playbook. |
| `mechanical` | Trivial mechanical edits and swarm workers. |
| `verify` | Runs verification against the app. |
| `review-correctness` | PR review seat for logic bugs. |
| `review-security` | PR review seat for security. |
| `review-performance` | PR review seat for performance. |
| `review-frontend` | PR review seat for UI changes. |
| `review-api` | PR review seat for API and contract changes. |
| `phoebe-owner` | The per-issue owner in the issue loop. |

Batch the 11 roles as 4, 4, 3 questions. Offer "use suggested for all remaining" as the way to skip ahead. It must be a single explicit answer from the user.

Then ask effort. Offer one question first: "keep suggested efforts" or "set effort per role". If the user wants per-role effort, ask each role in batches of up to 4 with options `low`, `medium`, `high`, `xhigh`. Effort `max` is available through "Other".

Write each role once you have both answers:

```
node <plugin root>/scripts/config.ts set models.<role> '{"model":"<model>","effort":"<effort>"}'
```

If the user names an exact model version, tell them the Agent tool takes families only. Store the family, then tell them how to pin the version by hand: set `model:` to the full version in the matching agent file under `<plugin root>/agents/`, such as `review-security.md` or `xiangli-yao.md`, knowing that plugin updates overwrite the edit. A role with no agent file is passed per spawn, so say the family is all that applies there.

## 3. Issue source and filter (project scope)

Ask where issues come from: GitHub or Linear. Then ask for the filter in free text: labels, assignee, milestone, and for Linear the team key. Write only what the user gave:

```
node <plugin root>/scripts/config.ts set issues '{"source":"github","labels":["astack"]}' --project
```

Keys are `issues.source`, `issues.labels`, `issues.assignee`, `issues.milestone`, `issues.linearTeam`. The user can skip this step. Say that the issue loop needs it.

## 4. Notifications

Ask for the reviewer's GitHub login (free text, optional): `set notify.reviewer '"login"'`. Ask whether to push (`notify.push`, on or off). `notify.requestReview` stays as it is unless the user brings it up.

## 5. Dev server (project scope)

Ask for the dev server command (for example `npm run dev`) and the base port. Ask about `readyPath` only if the user mentions a health route. Write:

```
node <plugin root>/scripts/config.ts set devServer '{"command":"npm run dev","basePort":3000}' --project
```

Skip when the project has no dev server.

## 6. Router hook

Explain: the router hook adds a `SessionStart` pointer so Claude routes every non-trivial task through `/astack:astack`. Ask on or off, then `set routerHook true` or `false`.

## 7. Permission allowlist

Target the project's `.claude/settings.json`, key `permissions.allow`. The entries:

- `Bash(git:*)`
- `Bash(gh:*)`
- `Bash(<pm>:*)` where `<pm>` follows the lockfile: `pnpm-lock.yaml` is `pnpm`, `yarn.lock` is `yarn`, `bun.lock` or `bun.lockb` is `bun`, otherwise `npm`.
- `Bash(node:*)`
- `Bash(npx playwright:*)`

Read the existing file first. Merge into it and never drop existing entries or other keys. Skip entries already present. Show the exact JSON diff of what you will add, then confirm with AskUserQuestion (write, or skip). Write the file only on a yes. Create `.claude/` if it is missing.

## 8. Competing plugins

Run `claude plugin list`. Name any enabled workflow plugin whose process skills auto-trigger, such as superpowers, agent-skills, or similar. They compete with AStack's router. For each, give the command `claude plugin disable <name>`. **Never run it yourself.** The user decides. If the command fails or lists none, say so in a line.

## 9. Finish

Run `node <plugin root>/scripts/config.ts set configured true`. Print a short summary of what you wrote and where (user file, project file, settings file), and point to `/astack:astack <task>` as the way to start.
