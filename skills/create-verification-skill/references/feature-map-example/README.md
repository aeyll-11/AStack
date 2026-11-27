# Notes verification map

This directory is the maintained source for verifying the user-facing behavior of Notes, a web app with pages under `/notes` and a JSON API under `/api`. Read the index before driving the app, then use the matching feature file as the recipe. Each feature file names its source files under `Ownership:`, so open those instead of searching the codebase.

`notes-cli` below means `node .claude/skills/verify-notes/scripts/notes-cli.mjs`, run from the repo root.

## Baseline preconditions

- Launch Notes with `notes-cli launch --port $PORT`. It runs `PORT=$PORT npm run dev` with `DATABASE_URL=file:/tmp/notes-verify-$PORT.db` and waits until `GET /api/health` returns 200.
- Run `notes-cli seed`. It runs `npm run db:migrate` and `npm run db:seed -- --fixture verify`. The fixture creates the user `verify@example.test` and the notes `Quarterly plan` (body `Draft budget`) and `Grocery list`.
- Sign in once with `notes-cli login`. It fills the `/login` form as `verify@example.test`, saves the browser session to `.astack/verify/state.json`, and writes a cookie jar for `curl` to `.astack/verify/cookies.txt`.
- Run `notes-cli doctor` and require every line to be `ok`: process, port, ready, seed, auth.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- One structural action per call. Run `notes-cli snapshot` before and after it, and read the snapshot instead of guessing.
- Target by role and accessible name (`button:New note`), then `testid:`, `label:`, `text:`. Never coordinates, never CSS chains.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run API requests with `curl -sS -i -b .astack/verify/cookies.txt http://127.0.0.1:$PORT<path>` and save the full response.
- Restore seeded data after a mutation with `notes-cli seed`. Do not remove proof artifacts during cleanup.
- A missing CLI capability is a CLI change. Never write a one-off browser script.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Page proof includes `notes-cli snapshot --out`, `notes-cli screenshot --out` with the app identity visible, and `notes-cli console` (no errors expected).
- API proof includes the request, the status line, the headers, and the body.
- Mutation proof includes a read-only second view of the stored value: `notes-cli reload` or a follow-up `GET`.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title, then a header block, then one paragraph describing the user-visible behavior.

- `Route:` the pages and API paths the feature lives on.
- `Selectors:` the stable role and testid handles the recipe targets.
- `Preconditions:` the state the recipe needs beyond the baseline.
- `Expected:` the observable end state that proves the feature works.
- `Ownership:` the source files: the entry point and the state owner.

It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with notes-cli` uses labeled bullets that pair each user action with exact CLI calls and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the recipes. `Ownership:` is the one place for source paths.

## Features

- [Create a note](./create-note.md) covers page and API creation, validation, cancellation, persistence, and cleanup.
- [Search notes](./search.md) covers toolbar, keyboard, URL, and API search with matching, empty, and clear states.
