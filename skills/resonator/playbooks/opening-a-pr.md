# Opening a PR

The shared tail of every code playbook. It takes verified work to a green PR with a human notified. Red past the retry bound, or a conflict, still notifies, with the PR left draft. It never merges.

1. **Prepare the branch.** Work in the PR slot from the router's Mechanics, and keep unrelated work out of it. Rebase into small, landable commits per the **commit** skill. Run the **no-comments** skill on the diff, then the **unslop** skill on the prose in the diff. Push with `git push -u origin HEAD`, never with force.
2. **Open the PR as draft.** `gh pr create --draft --title "<type(scope): subject>" --body-file <file>`. The title follows Conventional Commits and names a real symbol when one carries the change. Write the body with the **technical-writing** skill, with no AI attribution footer (no "Generated with Claude Code" line, no AI `Co-Authored-By:`). The same holds for every PR comment, and the commit guard denies a body or comment that has one: 40 lines at most, not counting the Spec block, with these `##` headings in order, empty ones dropped:
   - `## Why`: the goal, first. A phoebe owner ends it with its `Closes` line.
   - `## Spec`: `<repo>/.resonator/spec/<branch>.md` pasted verbatim. That file already opens with `## Spec` and holds Goal, Acceptance criteria, Guesses, and Open questions as `###` headings.
   - `## What changed`
   - `## How verified`: the **verify-web** evidence. Text evidence (requests and responses, console output, test output) goes inline.
   - `## Open questions`: only questions raised after the spec, such as arena alternatives you rejected.

   Stack follow-ups by base branch.
3. **Push evidence.** Screenshots and Playwright traces go to the evidence branch: `node <plugin root>/scripts/evidence.ts push --pr <n> <files...>`. It prints links. Put them in `## How verified` with `gh pr edit <n> --body-file <file>`. Long logs and run histories go in a file or a PR comment, linked from the body.
4. **Self-review.** Run the **pr-review** skill on the PR with the playbook's code role. It verifies each finding, fixes the real ones in the slot, pushes, and posts one comment. Keep the comment URL it returns. Rerun the **verify-web** skill on the criteria its fixes touch, and update `## How verified` when the evidence changes.
5. **Watch CI.** Run the **shorekeeper** skill on the PR with the playbook's code role. Resonator owns this branch. It returns `green`, `escalated`, `conflict`, or `closed`.
6. **Notify.** On `closed`, skip to the reply. On `escalated` or `conflict`, leave the PR draft and skip to the summary comment. Name each failing check with its link, or the conflicting base. On `green`:
   - Mark it ready: `gh pr ready <n>`.
   - If `node <plugin root>/scripts/config.ts get notify.requestReview` prints `true`, request review. The login is what `node <plugin root>/scripts/config.ts get notify.reviewer` prints. When that key is unset, use the repo owner from `gh repo view --json owner -q .owner.login`. If the login equals the PR author from `gh pr view <n> --json author -q .author.login`, skip the request, since GitHub rejects a request to review your own PR, and say so in the summary. Otherwise run `gh pr edit <n> --add-reviewer <login>`.

   Then, for every result but `closed`:
   - Post one summary comment with `gh pr comment <n> --body-file <file>`: what changed, how verified, a link to the **pr-review** comment with its fixed and rejected counts (do not restate the findings), the CI result, and what's left.
   - If `node <plugin root>/scripts/config.ts get notify.push` prints `true` and the `PushNotification` tool is offered, send the PR link and a one-line status with it. A phoebe owner leaves this to the lead.

Stop there. Opening a PR does not start a babysit. Never merge.

**Reply:** the PR link, the shorekeeper result and failing checks, unresolved review threads, the reviewer requested or why none was, and open questions.
