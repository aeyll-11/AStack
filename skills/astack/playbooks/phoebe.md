# Phoebe: the issue loop

**You run the queue. Each issue gets its own owner agent, in its own slot, visible on its own.** The human must see every issue in flight as a separate agent and a separate task. Phoebe never merges.

Read the queue config first: `node <plugin root>/scripts/config.ts get issues` (`no such key` means GitHub, no filter) and `node <plugin root>/scripts/config.ts get concurrency`. `issues.ts` below is `node <plugin root>/scripts/issues.ts`. It prints one JSON line and exits 2 when GitHub is unavailable. Report that and stop.

## Source

- **GitHub.** `issues.ts list` prints the open issues that match the filter and are not already labeled `astack:in-progress`.
- **Linear.** Look for tools whose names contain `linear`. If there are none, print `Skipped: Linear MCP not connected` and stop. Otherwise use them for every queue operation: list the team's open issues (`issues.linearTeam`) with the configured labels and assignee, claim (skip one that is assigned to someone else or not open, else assign it to me and set its status to In Progress), comment, and release (unassign and set the status back).

## Each tick

1. **Collect.** For each owner that has returned since the last tick, run the return step below.
2. **Fill.** Free slots = `concurrency` minus the owners still running. Take that many issues from the top of the list, and for each:
   - **Triage.** Read the title and body. If you cannot tell what done looks like, post one specific question with `issues.ts comment <n> --body-file <file>`, then `issues.ts release <n>`, and skip it. Never guess at an issue.
   - **Claim.** `issues.ts claim <n>`. On `skipped`, take the next issue.
   - **Task.** `TaskCreate` with the subject `phoebe-<n>: <short title>`.
   - **Slot.** `node <plugin root>/scripts/worktree.ts create --branch astack/<n>-<slug> --slot <i>`. `<slug>` is the title in kebab case, five words at most. `<i>` is a slot number from 1 to `concurrency` that no running owner holds. It prints the slot as JSON with its `path` and `port`.
   - **Comment.** `issues.ts comment <n> "Claimed by AStack. Working on branch astack/<n>-<slug>."`
3. **Spawn.** Start every owner of this tick in ONE message, so they run in parallel. Each is an `Agent` call with:
   - `description`: exactly `phoebe-<n>: <short title>`. That label is how the human tells the agents apart in the agent view.
   - `subagent_type: "astack:xiangli-yao"`, with `model` and `effort` from `node <plugin root>/scripts/config.ts model phoebe-owner`.
   - Background, and no `isolation`. The slot already is the owner's worktree.
   - The brief: `Read <plugin root>/skills/astack/worker.md before anything else.`, then `Read <plugin root>/skills/astack/phoebe-owner.md and follow it.`, then the values it names: `<plugin root>`, the issue number, title, URL, and source, the slot `path`, `port`, and branch, the task id, and the code role `implementer`.
4. **Record.** Put each returned agent id on its task with `TaskUpdate`, and set the step to `sharpen`. With the id, the human or you can message or stop that one owner.
5. **Status.** Post the table in the main chat, one row per issue in flight or finished this run:

   | Issue | Agent | Step | PR | CI |
   |---|---|---|---|---|
   | #12 Add dark mode toggle | phoebe-12 (`a1b2c3`) | verify | #48 | pending |

   Step comes from the task list: sharpen, implement, verify, review, CI, done, skipped, or escalated.

## When an owner returns

Read its result. Review its PR diff yourself, since you own every agent's work.

- **green.** Comment `PR <link> is green and ready for review.` on the issue. Remove the slot: `node <plugin root>/scripts/worktree.ts remove --branch <branch>`. Set the task to `done`. The label stays until the PR's `Closes #<n>` closes the issue.
- **escalated** or **conflict.** Keep the slot for the human. Comment on the issue with what is failing: each check by name and link, or the base to rebase on. The PR stays draft. Set the task to `escalated`.
- **unclear.** The owner already asked its question and released the issue. Remove the slot. Set the task to `skipped`.
- **closed.** Remove the slot. Set the task to `done`.

## Pacing

Under `/loop`, each firing is one tick. Fill the free slots, post the table, and return. Without `/loop`, repeat ticks until the list is empty and every owner has returned. Each owner ends in the **opening-a-pr** playbook. Never merge.

**Reply:** the final status table, each PR link, every issue skipped with its question, and every escalation with its failing checks.
