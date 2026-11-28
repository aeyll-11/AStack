# Archive a note

- **Route:** `POST /api/notes/<id>/archive`, `GET /api/notes/<id>`
- **Contract:** `POST /api/notes/<id>/archive` takes no body. It returns `204` with an empty body, `404` with `{"error":"note not found"}` for an unknown id, and `401` with `{"error":"unauthorized"}` without a session. `GET /api/notes/<id>` returns `200` with `{ id, title, body, archived }`, where `archived` is a boolean.
- **Preconditions:** signed in as `verify@example.test`; the `verify` seed is loaded, so `Grocery list` exists and is not archived.
- **Expected:** after the archive call, `GET /api/notes/<id>` shows `"archived":true`, and a second archive call still returns `204`.
- **Ownership:** `server/api/notes/[id]/archive.post.ts` (entry), `server/db/notes.ts` (state)

Archive a note lets a signed-in client hide a note without deleting it. The call is idempotent, and the note stays readable by id.

## Sub-features

- `archive-ok` archives an existing note.
- `archive-repeat` returns `204` again on an archived note and changes nothing.
- `archive-missing` returns `404` for an unknown id.
- `archive-unauth` refuses the call without a session.

## How to get to it (user POV)

- Send `POST /api/notes/<id>/archive` with the session cookie. There is no page for this feature.

## Driving it with notes-cli

- **Find the note.** `notes-cli http GET "/api/notes?title=Grocery%20list" --expect 200`. One note. Use its `id` below as `<id>`.
- **Archive.** `notes-cli http POST /api/notes/<id>/archive --expect 204 --out .resonator/evidence/$BRANCH/archive-note.json`. The line is `204` with no body.
- **Read it back.** `notes-cli http GET /api/notes/<id> --expect 200 --out .resonator/evidence/$BRANCH/archive-note-read.json`. The body has `"archived":true`.
- **Repeat.** The same archive call again. `204`, and the read-back is unchanged.
- **Missing note.** `notes-cli http POST /api/notes/999999/archive --expect 404`. The body is `{"error":"note not found"}`.
- **No session.** `notes-cli http POST /api/notes/<id>/archive --header "cookie:" --expect 401`. The body is `{"error":"unauthorized"}`.

## Gotchas

- A `204` alone is not proof. Always read the note back.
- An archived note drops out of `GET /api/notes`. Read it by id, not from the list.
- `notes-cli seed` restores `Grocery list` as unarchived. Run it after the pass.
