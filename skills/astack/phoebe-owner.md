# Issue owner brief

The lead of the issue loop (the **phoebe** playbook) gives this file to each per-issue owner agent. The lead's spawn brief supplies the values in angle brackets: `<plugin root>`, `<n>` (a GitHub number or a Linear identifier), `<title>`, `<url>`, `<source>`, `<slot path>`, `<port>`, `<branch>`, `<task id>`, and `<code role>`.

## Goal

Take issue `<n>` from spec to a green PR that closes it. The issue is the spec. You own this one issue. Other owners are working other issues in other slots at the same time.

## Where you work

- Work only in `<slot path>`. It is a git worktree on `<branch>`, created for you, with dependencies installed and `.env*` copied. `cd` there first and run every command from there.
- Never create another worktree, and never touch the main checkout or another slot. Do not pass `isolation: "worktree"` to any agent you start.
- The dev server for this slot runs on port `<port>`, such as `PORT=<port> npm run dev`. Never use the default port. Another slot may be on it.

## Steps

Read `<plugin root>/skills/astack/playbooks/feature.md` and run it with the issue as the feature description. Read the issue first: `gh issue view <n> --comments` for GitHub, or the Linear MCP tool that reads an issue for Linear.

- **Code steps.** Write the code yourself in the slot. Where the playbook says to delegate a writer, do the work yourself, since a second writer in one slot collides with you. Read-only agents, such as the **pr-review** seats, are fine.
- **Task status.** At the start of each step, run `TaskUpdate` on task `<task id>` with the step name: `sharpen`, `implement`, `verify`, `review`, `CI`. The human watches this list to see what you are doing. If the task tools are not offered to you, say each step change in one line of output instead.
- **Unclear issue.** At the sharpen step, if an unknown would change the whole feature, such as two incompatible readings, do not guess. Post one specific question on the issue, such as "Should the export include archived projects, or only active ones?". Use `node <plugin root>/scripts/issues.ts comment <n> --body-file <file>`, then `node <plugin root>/scripts/issues.ts release <n>`. For Linear, comment and unassign through the Linear MCP tools. Return `unclear`. Smaller unknowns become labeled guesses in `## Open questions`, as the feature playbook says.
- **The PR.** The feature playbook ends in the **opening-a-pr** playbook. Run it with `<code role>` as the code role. The PR body's `## Why` section ends with `Closes #<n>` on GitHub, or `Closes <n>` with the Linear identifier. Right after `gh pr create`, comment on the issue: `PR opened: <pr url>`.
- Never merge. Leave the PR draft unless the **opening-a-pr** playbook marks it ready after green CI.

This brief permits you to comment on issue `<n>` and on your PR. That is the only outside messaging it permits.

## Return

Reply to the lead with:

- **Result**: the **shorekeeper** result (`green`, `escalated`, `conflict`, or `closed`), or `unclear`.
- The PR link and the CI state, with each failing check by name and link.
- For `unclear`: the question you posted.
- Open questions from the spec step, and anything left for a human.
