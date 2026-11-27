# Search notes

Search lets a signed-in user find notes by title or body text, open a matching note, share a search by URL, and tell no matches apart from an unavailable search.

## Sub-features

- `search-open` opens search from each page entry point.
- `search-match` returns title and body matches without changing note data.
- `search-open-result` opens a result in the note editor.
- `search-url` restores a search from `/notes?q=<query>`.
- `search-empty` shows a complete empty state for a query with no matches.
- `search-clear` removes the query and restores the recent-notes view.
- `search-api` returns the same matching notes from `GET /api/notes/search`.

## How to get to it (user POV)

- Choose the `Search` button in the `/notes` toolbar.
- Press `/` on `/notes` while focus is outside an editable field.
- Open `/notes?q=<query>` directly or from a shared link.
- Send `GET /api/notes/search?q=<query>`.

## Driving it with verify-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:$PORT` and `verify-notes doctor` passes.
- The `verify` seed fixture is loaded, so `Quarterly plan` (body `Draft budget`) and `Grocery list` exist.
- The session in `auth.json` belongs to `verify@example.test`.

- **Toolbar entry.** Choose the `Search` button. Run `verify-notes browser goto /notes` and `verify-notes browser click --role button --name "Search"`. A dialog named `Search notes` appears with focus in its searchbox.
- **Keyboard entry.** Close the dialog, focus the page, and press `/`. Run `verify-notes browser press --key "/"`. The same dialog appears and the page does not insert a slash.
- **Title match.** Type `quarterly`. Run `verify-notes browser fill --role searchbox --name "Search notes" --value "quarterly"`. The `Search results` list contains `Quarterly plan` and does not contain `Grocery list`. The URL becomes `/notes?q=quarterly`.
- **Body match.** Replace the query with `budget`. Run `verify-notes browser fill --role searchbox --name "Search notes" --value "budget"`. The result `Quarterly plan` remains visible with a body-match excerpt.
- **Open result.** Choose `Quarterly plan`. Run `verify-notes browser click --role link --name "Quarterly plan"`. The dialog closes, the URL becomes `/notes/<id>`, and the editor heading reads `Quarterly plan`.
- **Shared URL.** Open the search by URL. Run `verify-notes browser goto "/notes?q=grocery"`. The dialog opens with `grocery` in the searchbox and `Grocery list` in the results.
- **Empty state.** Enter `volcano`. Run `verify-notes browser fill --role searchbox --name "Search notes" --value "volcano"`. A status named `No matching notes` appears after search completes.
- **Clear query.** Choose `Clear search`. Run `verify-notes browser click --role button --name "Clear search"`. The searchbox is empty, the URL is `/notes`, and the `Recent notes` region replaces the result list.
- **API match.** Run `verify-notes http -- -X GET "/api/notes/search?q=quarterly"`. Status `200` and the body is an array with one note titled `Quarterly plan`.
- **API miss.** Run `verify-notes http -- -X GET "/api/notes/search?q=volcano"`. Status `200` and the body is `[]`.
- **Proof.** Capture the populated result state. Run `verify-notes browser goto "/notes?q=quarterly"`, `verify-notes browser snapshot --aria --path search/results.aria.txt`, and `verify-notes browser screenshot --path search/results.png`. Both artifacts identify Notes, the query, and `Quarterly plan`.

## Gotchas

- Pressing `/` while the editor or searchbox has focus inserts text instead of opening search.
- Results update after a 250 ms debounce. Wait for the results list or the empty status, not a fixed sleep.
- Archived notes are excluded unless the user enables `Include archived`. The seed has none, so a match on an archived note needs its own fixture.
- Search only returns the signed-in user's notes. A missing session gives `401` from the API and a redirect to `/login` from the page, not an empty result.
- Opening a result changes page state. Reopen search before proving another query.
