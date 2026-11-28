---
name: verify-web
description: "Prove each acceptance criterion against the running app: the project's <app>-cli driver for HTTP and UI against a live dev server, and tests only where nothing else reaches. Captures evidence locally. Use for /verify-web, \"verify this\", or the verify step of the feature and bug-fix playbooks."
disable-model-invocation: true
---

# Verify web

Exercise the real app the way a user does and capture proof. "Tests pass" and "it compiles" are not verification. `<plugin root>` is two levels above this skill's folder.

Each criterion ends as **PASS**, **FAIL**, or **INCONCLUSIVE**. Inconclusive is never a pass. Report it as inconclusive and say what was missing.

## 1. Gather the criteria and the evidence folder

Run from the checkout that holds the change. Under the **resonator** router that is the PR slot.

```bash
repo=$(git rev-parse --show-toplevel)
branch=$(git rev-parse --abbrev-ref HEAD | tr / -)
ev="$repo/.resonator/evidence/$branch"
exclude="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$ev" "$(dirname "$exclude")"
git -C "$repo" check-ignore -q .resonator/evidence/x || echo ".resonator/evidence/" >> "$exclude"
git -C "$repo" check-ignore -q .resonator/verify/x || echo ".resonator/verify/" >> "$exclude"
echo "$ev"
```

Shell variables do not survive between Bash calls. Use the printed paths and the port literally in later steps.

- Read the criteria from `$repo/.resonator/spec/<branch>.md`. With no file, use the criteria in your brief. With neither, run the **spec** skill first.
- For a bug repro, the criterion is the repro itself: the request, page, or test that shows the bug.
- Tag every criterion by surface before you drive it: `[http]`, `[browser]`, or `[test]`. Criteria from a brief or a repro often carry no tag. Tag them by what a user touches: an API route is `[http]`, a page is `[browser]`. Use `[test]` only for logic no running app reaches cheaply.
- If the change touches user-facing or runtime code (pages, components, routes, handlers, middleware, server config) and no criterion is `[http]` or `[browser]`, add one that exercises the changed path. A `[test]` never stands in for the running app.
- Evidence stays local in `$ev`. Never `git add` it and never push it. The **opening-a-pr** playbook pushes images and traces with `evidence.ts`.

## 2. Get the project's driver CLI

Browser and HTTP criteria are driven only through the project's own `<app>-cli`, never through a script you write for this run.

- Find `.claude/skills/verify-*/SKILL.md` in the slot; `worktree.ts create` copies untracked ones from the repo root. With several, pick the one whose description names the surface you changed. Read it and its `features/README.md`. Its `Surface:` line (`ui`, `api`, or `both`) says which commands exist. Its CLI is `node .claude/skills/verify-<app>/scripts/<app>-cli.mjs`; below it is `cli`.
- With none, run the **create-verification-skill** skill first, then come back here and use the CLI it generated. A skill generated in the slot during a feature task is committed with that PR only if the user asked; otherwise it stays untracked and the lead copies it back to the repo root.
- If the project has no Playwright and the user declines adding it, the generated CLI still launches, seeds, and checks the app, so `[http]` criteria run. Every `[browser]` criterion is INCONCLUSIVE with "no Playwright in the project". Never PASS.

For each criterion, find the matching feature file in the map. Its `Ownership:` names the source files to read, its `Selectors:` the handles of a page or its `Contract:` the method, fields, and status codes of a route, and its recipe the CLI calls. A criterion the map does not cover is still driven through the CLI; note the gap so the **maintain-verification-skill** skill adds it.

## 3. Launch through the CLI

- **Port.** If your brief or this session has the JSON from `worktree.ts create`, use its `port`. Otherwise use `node <plugin root>/scripts/config.ts get devServer` → `basePort`, or the CLI's own default. `cli launch` refuses a port someone else holds; then pick the next free one and never drive the other instance.
- **Start.** Run `cli launch --port <port>`, `cli seed`, `cli login`, then `cli doctor`. Copy `.resonator/verify/app.log` into `$ev/server.log` when anything fails.
- **No auth.** With `auth: null`, `cli login` prints `skip no auth` and exits 0. Nothing needs a session.
- **No Playwright.** An `http` auth (`auth.http` in the config) signs in without a browser, so `cli login` still works. Only a `form` auth exits 3. Skip it then. A doctor failure on `auth` alone then blocks only the criteria that need a session.
- **Credentials.** `cli login` exits 2 and names the missing env var (`VERIFY_USER`, `VERIFY_TOKEN`). Report BLOCKED with that name. Never write the secret into a file or a command line; pass a token as `--header "Authorization: Bearer {env:VERIFY_TOKEN}"`.
- **Not ready** (`launch` or `doctor` exits non-zero): run `cli cleanup`, report `BLOCKED: <the CLI's reason>` with the last 40 lines of the log, and verify nothing.

## 4. Drive each criterion

**`[http]`.** One request per call: `cli http <METHOD> <route> [--json <body>] --expect <status> --out $ev/<n>-<slug>.json`. It sends the login cookie jar, prints `<status> <body>`, exits 1 on a status mismatch, and writes the request, status, headers, and body to the `--out` file. Compare the fields with the criterion. A mutation also needs a second `cli http GET` that shows the stored result. Only when the project has no CLI at all (its generation was blocked), run the request with `curl -sS -i -b .resonator/verify/cookies.txt` against `127.0.0.1:<port>` and save the exact command and the full response to `$ev/<n>-http.txt`.

**`[browser]`.** Through the CLI only:

1. `cli trace start` and `cli console` (clears earlier errors).
2. Follow the feature's recipe: `cli open <route>`, then one action per call (`cli click <target>`, `cli fill <target> <text>`, `cli press <key>`, `cli wait --text <t>`), with `cli snapshot` before and after each. Targets are `role:name`, `testid:`, `label:`, or `text:`. Never coordinates.
3. Assert the visible result from the snapshot. Then `cli screenshot --out $ev/<n>-<slug>.png`, `cli snapshot --out $ev/<n>-<slug>.aria.txt`, `cli console > $ev/<n>-console.txt`, and `cli trace stop --out $ev/<n>-trace.zip`.
4. Any console error the change caused is a FAIL.

If the CLI cannot do a step, that is a harness gap: report the criterion INCONCLUSIVE with the step and suggest the **maintain-verification-skill** skill. Do not work around it with a one-off script.

**`[test]`.** Run the named command. Save the command, its output, and its exit code to `$ev/<n>-test.txt`.

Drive the real user path. No test-only endpoints, no setting state from outside. A criterion you could not reach is INCONCLUSIVE with the step attempted and what blocked it, never a pass through another path.

## 5. Clean up

Always, including after a failure or a blocked start: `cli cleanup`. It stops the browser and kills only what `cli launch` started, by its recorded PID. Confirm with `cli status` that nothing is alive. Evidence stays in `$ev`.

## 6. Report

One row per criterion:

| # | Criterion | Surface | Result | Evidence |
|---|---|---|---|---|
| 1 | POST /api/notes/42/archive returns 204 | http | PASS | `.resonator/evidence/feat-archive/1-archive.json` |
| 2 | "Archive" removes the note from /notes | browser | INCONCLUSIVE | No Playwright in the project |

The overall result is the first that applies:

1. **FAIL** if any row fails.
2. **INCONCLUSIVE** if any row is inconclusive.
3. **INCONCLUSIVE ("no real-app criterion")** if the change touches user-facing or runtime code and no `[http]` or `[browser]` row passed. Passing tests alone are proxy verification.
4. **PASS** otherwise.

Paste text evidence (requests and responses, console output, test output) inline for the PR's `## How verified`. List the image and trace files separately, since those get pushed later.
