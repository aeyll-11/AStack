# Notes verification map

This directory is the maintained source for verifying the user-facing behavior of Notes, a web app with pages under `/notes` and a JSON API under `/api`. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch Notes with `PORT=$PORT npm run dev` and wait until `GET http://127.0.0.1:$PORT/api/health` returns 200.
- Point it at a disposable database with `DATABASE_URL=file:/tmp/notes-verify-$RUN_ID.db` so concurrent runs do not share state.
- Run `npm run db:migrate` and then `npm run db:seed -- --fixture verify`. The fixture creates the user `verify@example.test` with password `verify-pass` and the notes `Quarterly plan` (body `Draft budget`) and `Grocery list`.
- Sign in once with `verify-notes login`. It saves the browser session to `.astack/evidence/$BRANCH/auth.json` and a cookie jar for `curl` to `.astack/evidence/$BRANCH/cookies.txt`.
- Run `verify-notes doctor` and require the expected URL, database file, build revision, and a signed-in session.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run browser actions through `verify-notes browser`. It reuses `auth.json`, so pages open signed in.
- Run API requests through `verify-notes http -- <curl args>`. It adds the cookie jar and saves the request and response.
- Restore seeded data after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Page proof includes an ARIA snapshot, a screenshot with the app identity visible, and the console errors (none expected).
- API proof includes the request, the status line, the headers, and the body.
- Mutation proof includes a read-only second view of the stored value: a page reload or a follow-up `GET`.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Create a note](./create-note.md) covers page and API creation, validation, cancellation, persistence, and cleanup.
- [Search notes](./search.md) covers toolbar, keyboard, URL, and API search with matching, empty, and clear states.
