# Acceptance runs

These features cannot be proved offline. They need a live run against a GitHub repo you can push to. Run each one, then record the PR or issue link and the date under its heading.

## Phoebe issue loop

Prerequisite: a throwaway repo with two labelled issues, one clear and one vague. Run `/resonator:resonator` on the `phoebe` playbook.

- The clear issue gets claimed, a `phoebe-<n>` owner works it in its own worktree slot, and a green PR titled "Closes #<n>" opens.
- The vague issue gets one specific question and the `resonator:needs-info` label.

## opening-a-pr notification

Prerequisite: a branch with a trivial change and CI that passes. Run the `opening-a-pr` playbook.

- The draft PR is marked ready, review is requested from `notify.reviewer` or the repo owner, and the summary comment is posted.
- With `notify.push` on, a push notification arrives.
- With CI forced red past `ciRetries`, the PR stays a draft, the comment names each failing check with its link, and the notification still arrives.

## Never merges

After either run, confirm no merge happened and that `.claude/settings.json` holds the `gh pr merge` deny entry written by `/resonator:setup-resonator`.

## App driver CLI

Prerequisite: a web app repo with Playwright as a dev dependency and no `.claude/skills/verify-*`. Run `/resonator:create-verification-skill`.

- The generated `.claude/skills/verify-<app>/scripts/<app>-cli.mjs` runs `launch`, `seed`, `login`, `doctor`, `open`, `click`, `fill`, `snapshot`, `screenshot`, `console`, and `cleanup` without edits.
- After `cleanup`, `status` shows nothing alive, the port is free, and the screenshot still exists.
- `/resonator:verify-web` on a UI criterion drives it through that CLI and writes no browser script of its own.

## Live script runs

`issues.ts claim|comment|release|pr-status`, `evidence.ts push`, and `watch-pr/cli.ts` against a real PR. The unit tests use fakes. Verify one real call each.
