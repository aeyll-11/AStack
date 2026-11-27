# Verification and review

"Tests pass" is not verification. AStack proves behavior against the running app.

## Verify

The **verify-web** skill checks each acceptance criterion on the real surface. It uses a real browser for UI and HTTP against a live dev server for backend work. Tests cover only what those cannot reach. It captures evidence locally. An "inconclusive" result is flagged, not passed.

Set the dev server so the skill can start it:

```
node <plugin root>/scripts/config.ts set devServer '{"command":"npm run dev","basePort":3000}' --project
```

Each worktree slot runs on `basePort` plus its slot number. Slots share the local database. `dbPerSlot` is reserved and has no effect yet.

## Project verification skill

Generate a skill that drives your app the way a user does: server launch, sign-in, seed data, routes.

```
/astack:create-verification-skill
/astack:maintain-verification-skill
```

The second runs periodically to keep the skill and its feature map accurate.

## Self-review

`/astack:pr-review` runs read-only reviewers in parallel: `review-correctness`, `review-security`, `review-api`, and `review-performance`. `zhezhi` joins only when the diff touches UI files. The lead verifies each finding and fixes only those with a concrete failure scenario.

Set each seat's model with `node <plugin root>/scripts/config.ts set models.review-security '{"model":"opus"}'`.

## Heavier checks

- `/astack:interrogate` for a contested design: adversarial reviewers try to break it.
- `/astack:blast-radius` for what a change could break elsewhere.
- `/astack:benchmark-checklist` before you report a measurement.

## CI

The **shorekeeper** skill watches CI. On a red run it finds the root cause, fixes, pushes, and watches again, up to `ciRetries`. It returns `green`, `escalated`, `conflict`, or `closed`.
