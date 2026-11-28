# Verification and review

"Tests pass" is not verification. Resonator proves behavior against the running app.

## Verify

The **verify-web** skill checks each acceptance criterion on the real surface: HTTP against a live dev server for backend work, and the project's driver CLI for UI. Tests cover only what those cannot reach. It captures evidence locally. An "inconclusive" result is flagged, not passed.

Each worktree slot runs on `basePort` plus its slot number. Slots share the local database. `dbPerSlot` is reserved and has no effect yet.

## Project verification skill

Browser verification needs a project verify skill. If the repo has none, **verify-web** generates one first.

```
/resonator:create-verification-skill
```

It writes `.claude/skills/verify-<app>/` with two parts:

- **Feature map.** `features/README.md` plus one file per user-facing feature. Each file names its `Route:`, `Selectors:`, `Preconditions:`, `Expected:` end state, and `Ownership:` source files, then lists the CLI calls that drive it. The agent reads the map instead of searching the code.
- **Driver CLI.** `scripts/<app>-cli.mjs`, built on the project's own Playwright. The agent calls it instead of writing a browser script:

  ```
  node .claude/skills/verify-notes/scripts/notes-cli.mjs launch --port 3101
  node .claude/skills/verify-notes/scripts/notes-cli.mjs login
  node .claude/skills/verify-notes/scripts/notes-cli.mjs open /notes
  node .claude/skills/verify-notes/scripts/notes-cli.mjs click "button:New note"
  node .claude/skills/verify-notes/scripts/notes-cli.mjs snapshot
  node .claude/skills/verify-notes/scripts/notes-cli.mjs screenshot --out .resonator/evidence/feat-x/1.png
  node .claude/skills/verify-notes/scripts/notes-cli.mjs cleanup
  ```

  Targets are a role and name, a test id, a label, or text, never coordinates. Waits, sign-in, seed, and cleanup live once in the CLI, so every session reuses the same tested steps.

Without Playwright in the project, browser criteria stay inconclusive.

## Daily maintenance

```
/resonator:maintain-verification-skill
```

It reads the source for every feature, checks `Ownership:` paths and `Selectors:` handles, drives every feature live through the CLI, and opens at most one PR of proven fixes to the map or the CLI. It needs the app running locally, so schedule it on your machine. `/resonator:setup-resonator` offers `/loop 24h /resonator:maintain-verification-skill verify-<app>` in an open session, or shows a crontab line for you to add.

## Self-review

`/resonator:pr-review` runs read-only reviewers in parallel: `review-correctness`, `review-security`, `review-api`, and `review-performance`. `zhezhi` joins only when the diff touches UI files. The lead verifies each finding, fixes only those with a concrete failure scenario, pushes, and posts one PR comment with every finding and its verdict. The PR summary links that comment.

Set each seat's model with `node <plugin root>/scripts/config.ts set models.review-security '{"model":"opus"}'`.

## Heavier checks

- `/resonator:interrogate` for a contested design: adversarial reviewers try to break it.
- `/resonator:blast-radius` for what a change could break elsewhere.
- `/resonator:benchmark-checklist` before you report a measurement.

## CI

The **shorekeeper** skill watches CI. On a red run it finds the root cause, fixes, pushes, and watches again, up to `ciRetries`. It returns `green`, `escalated`, `conflict`, or `closed`.
