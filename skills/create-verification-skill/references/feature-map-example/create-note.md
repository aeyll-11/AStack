# Create a note

- **Route:** `/notes`, `/notes/new`, `/notes/<id>`, `POST /api/notes`
- **Selectors:** `button:New note`, `form:Note editor`, `textbox:Title`, `textbox:Body`, `button:Save note`, `button:Cancel`, `status:Note saved`, `testid:notes-list`
- **Preconditions:** signed in as `verify@example.test`; no note titled `Release checklist`.
- **Expected:** the note appears in `testid:notes-list`, survives a reload, and `GET /api/notes?title=...` returns it.
- **Ownership:** `app/pages/notes/new.vue` (entry), `app/stores/notes.ts` (state), `server/api/notes/index.post.ts` (API)

Create note lets a signed-in user save a titled note from the `/notes` page or the API, cancel an unfinished draft, and confirm the saved note from a second view.

## Sub-features

- `create-open` opens a blank editor from each page entry point.
- `create-save` persists a title and body.
- `create-validate` rejects an empty title with a visible error.
- `create-cancel` discards an unfinished draft.
- `create-api` creates the same note shape with `POST /api/notes`.
- `create-unauth` refuses creation without a session.

## How to get to it (user POV)

- Choose the `New note` button on `/notes`.
- Press `n` on `/notes` while focus is outside an editable field.
- Open `/notes/new` directly.
- Send `POST /api/notes` with a JSON body `{ "title": ..., "body": ... }`.

## Driving it with notes-cli

- **Open editor.** `notes-cli open /notes`, then `notes-cli click "button:New note"`. The URL becomes `/notes/new` and `notes-cli snapshot` shows a form `Note editor` with an empty `Title` textbox.
- **Keyboard entry.** `notes-cli open /notes`, then `notes-cli press n`. The same editor opens.
- **Empty title.** `notes-cli click "button:Save note"`. The snapshot shows an alert `Title is required` and the URL stays `/notes/new`.
- **Enter content.** `notes-cli fill "textbox:Title" "Release checklist"`, then `notes-cli fill "textbox:Body" "Tag and publish"`. The alert is gone from the snapshot.
- **Save note.** `notes-cli click "button:Save note"`, then `notes-cli wait --text "Note saved"`. The URL becomes `/notes/<id>` and the heading reads `Release checklist`.
- **Confirm persistence.** `notes-cli reload`, then `notes-cli snapshot`. The editor shows both saved values. Then `notes-cli http GET "/api/notes?title=Release%20checklist" --expect 200`. One note with body `Tag and publish`.
- **Cancel draft.** `notes-cli click "button:New note"`, `notes-cli fill "textbox:Title" "Discard me"`, `notes-cli click "button:Cancel"`. The URL returns to `/notes` and `testid:notes-list` has no `Discard me` link.
- **API entry.** `notes-cli http POST /api/notes --json '{"title":"API note","body":"Created over HTTP"}' --expect 201 --out .resonator/evidence/$BRANCH/create-note-api.json`. The body has the new `id` and title.
- **No session.** The same request with `--header "cookie:" --expect 401`, which overrides the jar. `notes-cli open /notes` then shows no new note.
- **Proof.** `notes-cli open /notes`, `notes-cli snapshot --out .resonator/evidence/$BRANCH/create-note.aria.txt`, `notes-cli screenshot --out .resonator/evidence/$BRANCH/create-note.png`, `notes-cli console`. Both artifacts show `Release checklist` and `API note`, and `console` reports `errors=0`.

## Gotchas

- `notes-cli press n` while a textbox has focus types the character instead of opening a new editor. Open `/notes` first.
- Titles are trimmed on save. Assert the rendered title, not the draft input value.
- A `Note saved` status alone is insufficient proof. Reload or read the note back over the API.
- The API needs the `x-csrf-token` header from the session cookie. Without it the request gets `403`, which is not the `401` this map expects.
- Reset `Release checklist` and `API note` with `notes-cli seed` after the run, but keep their proof artifacts.
