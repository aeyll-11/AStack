# Create a note

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

## Driving it with verify-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:$PORT` and `verify-notes doctor` passes.
- The session in `auth.json` belongs to `verify@example.test`.
- No note is titled `Release checklist`.

- **Open editor.** Choose `New note`. Run `verify-notes browser goto /notes` and `verify-notes browser click --role button --name "New note"`. The URL becomes `/notes/new` and a form named `Note editor` has focus in the `Title` textbox.
- **Empty title.** Choose `Save note` with no title. Run `verify-notes browser click --role button --name "Save note"`. An alert reading `Title is required` appears and the URL stays `/notes/new`.
- **Enter content.** Type the title and body. Run `verify-notes browser fill --role textbox --name "Title" --value "Release checklist"` and `verify-notes browser fill --role textbox --name "Body" --value "Tag and publish"`. The alert disappears.
- **Save note.** Choose `Save note`. Run `verify-notes browser click --role button --name "Save note"`. A status named `Note saved` appears, the URL becomes `/notes/<id>`, and the heading reads `Release checklist`.
- **Confirm persistence.** Reload the page. Run `verify-notes browser reload`. The editor shows both saved values. Then run `verify-notes http -- -X GET /api/notes?title=Release%20checklist`. Status `200` and the body has one note with body `Tag and publish`.
- **Cancel draft.** Open a new note, enter `Discard me`, and choose `Cancel`. Run `verify-notes browser click --role button --name "New note"`, `verify-notes browser fill --role textbox --name "Title" --value "Discard me"`, and `verify-notes browser click --role button --name "Cancel"`. The URL returns to `/notes` and the `Notes` list has no `Discard me` link.
- **API entry.** Create a second note. Run `verify-notes http -- -X POST /api/notes -H "content-type: application/json" -d '{"title":"API note","body":"Created over HTTP"}'`. Status `201` and the body contains the new note's `id` and title.
- **No session.** Repeat the request without cookies. Run `verify-notes http --anonymous -- -X POST /api/notes -H "content-type: application/json" -d '{"title":"x"}'`. Status `401` and no note titled `x` exists afterwards.
- **Proof.** Show both saved notes in the list. Run `verify-notes browser goto /notes`, `verify-notes browser snapshot --aria --path create-note/list.aria.txt`, and `verify-notes browser screenshot --path create-note/list.png`. The artifacts show `Release checklist` and `API note`.

## Gotchas

- Pressing `n` while a textbox has focus types the character instead of opening a new editor.
- Titles are trimmed on save. Assert the rendered title, not the draft input value.
- A `Note saved` status alone is insufficient proof. Reload the page or read the note back over the API.
- The API requires the CSRF header `x-csrf-token` from the session. `verify-notes http` adds it. Raw `curl` gets `403`.
- Remove `Release checklist` and `API note` during cleanup with `npm run db:seed -- --fixture verify --reset`, but keep their proof artifacts.
