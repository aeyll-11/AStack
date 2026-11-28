# Search notes

- **Route:** `/notes`, `/notes?q=<query>`, `GET /api/notes/search?q=<query>`
- **Selectors:** `button:Search`, `dialog:Search notes`, `searchbox:Search notes`, `list:Search results`, `status:No matching notes`, `button:Clear search`, `region:Recent notes`
- **Preconditions:** signed in as `verify@example.test`; the `verify` seed is loaded, so `Quarterly plan` (body `Draft budget`) and `Grocery list` exist.
- **Expected:** a query lists only matching notes, the URL carries `?q=`, and the API returns the same notes.
- **Ownership:** `app/components/SearchDialog.vue` (entry), `app/composables/useSearch.ts` (state), `server/api/notes/search.get.ts` (API)

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

## Driving it with notes-cli

- **Toolbar entry.** `notes-cli open /notes`, then `notes-cli click "button:Search"`. The snapshot shows a dialog `Search notes` with a focused searchbox.
- **Keyboard entry.** `notes-cli press Escape`, then `notes-cli press /`. The same dialog appears and no slash is typed into the page.
- **Title match.** `notes-cli fill "searchbox:Search notes" "quarterly"`, then `notes-cli wait --text "Quarterly plan"`. `list:Search results` contains `Quarterly plan` and not `Grocery list`. The URL becomes `/notes?q=quarterly`.
- **Body match.** `notes-cli fill "searchbox:Search notes" "budget"`. `Quarterly plan` stays visible with a body-match excerpt.
- **Open result.** `notes-cli click "link:Quarterly plan"`. The dialog closes, the URL becomes `/notes/<id>`, and the heading reads `Quarterly plan`.
- **Shared URL.** `notes-cli open "/notes?q=grocery"`. The dialog opens with `grocery` in the searchbox and `Grocery list` in the results.
- **Empty state.** `notes-cli fill "searchbox:Search notes" "volcano"`, then `notes-cli wait --text "No matching notes"`. The status appears after the search completes.
- **Clear query.** `notes-cli click "button:Clear search"`. The searchbox is empty, the URL is `/notes`, and `region:Recent notes` replaces the result list.
- **API match.** `curl -sS -i -b .resonator/verify/cookies.txt "http://127.0.0.1:$PORT/api/notes/search?q=quarterly"`. Status `200` and an array with one note titled `Quarterly plan`.
- **API miss.** The same with `q=volcano`. Status `200` and the body is `[]`.
- **Proof.** `notes-cli open "/notes?q=quarterly"`, `notes-cli snapshot --out .resonator/evidence/$BRANCH/search.aria.txt`, `notes-cli screenshot --out .resonator/evidence/$BRANCH/search.png`, `notes-cli console`. Both artifacts identify Notes, the query, and `Quarterly plan`.

## Gotchas

- `/` while the editor or searchbox has focus inserts text instead of opening search.
- Results update after a 250 ms debounce. Use `notes-cli wait --text`, never a fixed sleep.
- Archived notes are excluded unless the user enables `Include archived`. The seed has none, so a match on an archived note needs its own fixture.
- Search only returns the signed-in user's notes. A missing session gives `401` from the API and a redirect to `/login` from the page, not an empty result. `notes-cli open` reports the missing app marker on the login page.
- Opening a result changes page state. Reopen search before proving another query.
