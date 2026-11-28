---
name: spec
description: "Turn a feature description or issue body into a short spec: goal, acceptance criteria each checkable over HTTP, in a browser, or by a test, labeled guesses, and open questions. Use for /spec, \"spec this\", or the first step of the feature playbook."
disable-model-invocation: true
---

# Spec

Turn a description or an issue body into a spec the rest of the run can verify. There is no human gate. Fill gaps with labeled guesses and keep going. `<plugin root>` is two levels above this skill's folder.

## 1. Read before you write

- Read the input in full. An issue body counts as the input, comments included.
- Read the code it touches: the routes, pages, API handlers, schema, and tests nearest the change. Run `node <plugin root>/scripts/detect.ts` and name the active packs.
- Restate the goal in one sentence, from the user's side. "A signed-in user can archive a note from `/notes` and it disappears from the list" beats "add an archive flag".

## 2. Write acceptance criteria

Each criterion is one observable behavior, tagged with the surface that proves it:

- `[http]` A request and the response that proves it. Name the method, path, body, and the status and fields you expect. Example: `[http] POST /api/notes/42/archive as the seeded user returns 204, then GET /api/notes omits id 42.`
- `[browser]` A page, a user action, and what the user then sees. Name stable handles: route, ARIA role and accessible name, visible text. Example: `[browser] On /notes, choosing the "Archive" button on "Quarterly plan" removes it from the "Notes" list with no console errors.`
- `[test]` A test that pins logic no running app can reach cheaply, with the command that runs it. Example: `[test] npm test -- archive.test.ts covers archiving an already archived note.`

Rules:

- Every criterion is checkable by the **verify-web** skill without asking anyone. "Works well" and "is fast" are not criteria. "p95 of GET /api/notes under 200 ms with 1k seeded notes" is.
- A change to user-facing or runtime code (pages, components, routes, handlers, middleware, server config) gets at least one `[http]` or `[browser]` criterion. A `[test]` never stands in for the running app. Without a passing `[http]` or `[browser]` criterion, **verify-web** reports INCONCLUSIVE, never PASS.
- Cover the failure path the user can hit: bad input, missing auth, empty state.
- Keep it short. Three to seven criteria is the usual range. More means the task should split.

## 3. Guess, don't stall

Where the input is silent, pick the reading that best fits the code and the product, and label it. Each guess is one line: `Guess: <choice>, because <evidence>.` Each guess that a human might reverse also goes in Open questions.

**Stop only when two incompatible readings exist**, readings that would change the whole feature rather than a detail. Then return `BLOCKED: two readings` with both readings, the one question that separates them, and the code you read. Do not write a spec for either reading.

## 4. Save and return

Save the block to `<repo>/.resonator/spec/<branch>.md`, where `<repo>` is `git rev-parse --show-toplevel` and `<branch>` is the current branch with each `/` replaced by `-`. Under the **resonator** router, run this from the PR slot, so `<branch>` is the PR branch. Keep it out of git through the shared exclude file, never `.gitignore`:

```bash
repo=$(git rev-parse --show-toplevel)
branch=$(git rev-parse --abbrev-ref HEAD | tr / -)
exclude="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$repo/.resonator/spec" "$(dirname "$exclude")"
git -C "$repo" check-ignore -q .resonator/spec/x || echo ".resonator/spec/" >> "$exclude"
```

Then write the file with this shape and return the same block to the caller, so it can go in the PR body:

```markdown
## Spec

### Goal
<one sentence, user's side>

### Acceptance criteria
1. [http] ...
2. [browser] ...
3. [test] ...

### Guesses
- Guess: ..., because ...

### Open questions
- ...
```

Drop an empty section rather than writing "none". Rerunning on the same branch overwrites the file. The **verify-web** skill reads the criteria from it.
