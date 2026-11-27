# Opening a PR

The shared tail of every code playbook. It takes verified work to a green PR with a human notified. Red past the retry bound, or a conflict, still notifies, with the PR left draft. It never merges.

1. **Prepare the branch.** Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run the **no-comments** skill on the diff, then the **unslop** skill on the prose in the diff. Push the branch.
2. **Open the PR as draft.** `gh pr create --draft --title "<type(scope): subject>" --body-file <file>`. The title follows Conventional Commits and names a real symbol when one carries the change. Write the body with the **technical-writing** skill: 40 lines at most, these `##` headings in order, empty ones dropped:
   - `## Why`: the goal, first.
   - `## What changed`
   - `## How verified`: the **verify-web** evidence. Text evidence (requests and responses, console output, test output) goes inline.
   - `## Open questions`: every labeled guess from the spec step.

   Stack follow-ups by base branch.
3. **Push evidence.** Screenshots and Playwright traces go to the evidence branch: `node <plugin root>/scripts/evidence.ts push --pr <n> <files...>`. It prints links. Put them in `## How verified` with `gh pr edit <n> --body-file <file>`. Long logs and run histories go in a file or a PR comment, linked from the body.
4. **Self-review.** Run the **pr-review** skill on the PR's diff. Verify each finding yourself. Act only on findings with a concrete failure scenario.
5. **Fix findings and push.** Delegate fixes to `astack:xiangli-yao` with the playbook's code role and `isolation: "worktree"`. Re-verify what the fix touches. Push.
6. **Watch CI.** Run the **shorekeeper** skill on the PR with the playbook's code role. AStack owns this branch. It returns `green`, `escalated`, `conflict`, or `closed`.
7. **Notify.** On `closed`, skip to the reply. On `escalated` or `conflict`, leave the PR draft and skip to the summary comment. Name each failing check with its link, or the conflicting base. On `green`:
   - Mark it ready: `gh pr ready <n>`.
   - If `node <plugin root>/scripts/config.ts get notify.requestReview` prints `true`, request review: `gh pr edit <n> --add-reviewer <login>`. The login comes from `node <plugin root>/scripts/config.ts get notify.reviewer`. When that key is unset, use the repo owner from `gh repo view --json owner -q .owner.login`.

   Then, for every result but `closed`:
   - Post one summary comment with `gh pr comment <n> --body-file <file>`: what changed, how verified, the review findings (found, fixed, rejected with reason), the CI result, and what's left.
   - If `node <plugin root>/scripts/config.ts get notify.push` prints `true`, send the PR link and a one-line status with the `PushNotification` tool.

Stop there. Opening a PR does not start a babysit. Never merge.

**Reply:** the PR link, the shorekeeper result and failing checks, unresolved review threads, the reviewer requested, and open questions.
