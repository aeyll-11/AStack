# Issue owner brief

The lead of the issue loop (the **phoebe** playbook) gives this file to each per-issue owner agent. The lead's spawn brief supplies the values in angle brackets: `<plugin root>`, `<n>` (a GitHub number or a Linear identifier), `<title>`, `<url>`, `<source>`, `<slot path>`, `<port>`, `<branch>`, `<task id>`, and `<code role>`.

## Goal

Take issue `<n>` from spec to a green PR that closes it. The issue is the spec. You own this one issue. Other owners are working other issues in other slots at the same time.

## Where you work

- Work only in `<slot path>`. It is your PR slot: a git worktree on `<branch>`, cut from trunk, with dependencies installed and `.env*` and `.resonator/config.json` copied. `cd` there first and run every command from there. You lead this slot. You commit and push to `<branch>` yourself.
- Create no other worktree except the slots the router's parallel-writer rule makes, and never touch the main checkout or another owner's slot. Do not pass `isolation: "worktree"` to a writer you start.
- The dev server for this slot runs on port `<port>`, such as `PORT=<port> npm run dev`. Never use the default port. Another slot may be on it.

## Steps

Read `<plugin root>/skills/resonator/playbooks/feature.md` and run it with the issue as the feature description. Read the issue first: `gh issue view <n> --comments` for GitHub, or the Linear MCP tool that reads an issue for Linear.

- **Code steps.** The feature playbook's slot step is done. A writer you delegate works in `<slot path>` under the router's writer rule, with no `isolation`, while you wait. Read-only agents, such as the **pr-review** seats, are fine when you can start them.
- **No Agent tool.** You may not be offered the `Agent` tool. Then:
  - This brief overrides the feature playbook's mandatory **arena** step. Skip arena. Pick one shape yourself and list the alternatives you rejected, with one line each, in the PR's `## Open questions`.
  - Run each **pr-review** seat inline yourself, one after another: read the seat's agent file under `<plugin root>/agents/` and review the diff as that seat. Do the same for `comment-sicko` when the **no-comments** skill names it, and make its deletions yourself in the slot.
  - Do everything else a step would delegate yourself, in the slot.
- **Task status.** At the start of each step, run `TaskUpdate` on task `<task id>` with the step name: `sharpen`, `implement`, `verify`, `review`, `CI`. The lead also tracks your PR and CI from GitHub, and its update is the one the human trusts. Skip this if the task tools are not offered to you.
- **Unclear issue.** At the sharpen step, if an unknown would change the whole feature, such as two incompatible readings, do not guess. Post one specific question on the issue, such as "Should the export include archived projects, or only active ones?". Use `node <plugin root>/scripts/issues.ts comment <n> --body-file <file>`, then `node <plugin root>/scripts/issues.ts release <n> --needs-info`. For Linear, comment and unassign through the Linear MCP tools. Return `unclear`. Smaller unknowns become labeled guesses in the spec's Guesses, as the feature playbook says.
- **The PR.** The feature playbook ends in the **opening-a-pr** playbook. Run it with `<code role>` as the code role. The PR body's `## Why` section ends with `Closes #<n>` on GitHub, or `Closes <n>` with the Linear identifier. Skip its push notification. The lead sends it. Right after `gh pr create`, comment on the issue: `PR opened: <pr url>`.
- Never merge. Leave the PR draft unless the **opening-a-pr** playbook marks it ready after green CI.

This brief permits you to comment on issue `<n>` and on your PR. That is the only outside messaging it permits.

## Return

Reply to the lead with:

- **Result**: the **shorekeeper** result (`green`, `escalated`, `conflict`, or `closed`), or `unclear`.
- The PR link and the CI state, with each failing check by name and link.
- For `unclear`: the question you posted.
- Open questions from the spec step, and anything left for a human.
