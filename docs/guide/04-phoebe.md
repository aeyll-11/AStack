# Phoebe, the issue loop

Phoebe works a queue of issues. Every issue gets its own owner agent in its own worktree, visible on its own.

## Configure the queue

```
node <plugin root>/scripts/config.ts set issues '{"source":"github","labels":["astack"]}' --project
node <plugin root>/scripts/config.ts set concurrency 2
```

Or answer step 3 of `/astack:setup-astack`. Linear needs a connected Linear MCP server. Without one Phoebe prints `Skipped: Linear MCP not connected` and stops.

## Run it

```
/astack:astack work the issue queue
```

## Seeing what is running

- **Agents.** Each owner is spawned with the description `phoebe-<n>: <short title>`, so you can tell them apart in the agent view. You can message or stop one owner by its id.
- **Task list.** Each issue has a task `phoebe-<n>: <short title>` whose step moves through sharpen, implement, verify, review, CI, done, skipped, or escalated.
- **Status table.** Posted in the main chat each tick:

  | Issue | Agent | Step | PR | CI |
  |---|---|---|---|---|
  | #12 Add dark mode toggle | phoebe-12 (`a1b2c3`) | CI | #48 | pending |

- **Issue comments.** Phoebe comments `Claimed by AStack. Working on branch astack/<n>-<slug>.` when it starts and `PR <link> is green and ready for review.` when it finishes. On escalation it names each failing check or the base to rebase on.

## Labels

- `astack:in-progress` marks a claimed issue. Issues with it are not listed again. It stays until the PR's `Closes #<n>` closes the issue.
- `astack:needs-info` marks an issue Phoebe could not act on. It posts one specific question and releases the issue. The label keeps it out of the queue until you remove it.

## Outcomes per issue

| Result | What happens |
|---|---|
| green | Comment on the issue, remove the worktree slot, task done |
| escalated or conflict | Slot kept for you, PR stays draft, comment lists what fails |
| unclear | Question posted, `astack:needs-info`, task skipped |
| closed | Slot removed, task done |

## Under `/loop`

```
/loop /astack:astack work the issue queue
```

Each firing is one tick. It collects returned owners, fills free slots up to `concurrency`, posts the table, and returns. Without `/loop`, Phoebe repeats ticks until the list is empty and every owner has returned. Phoebe never merges.
