---
name: verify-web
description: "Prove each acceptance criterion against the running app: HTTP against a live dev server, a real browser for UI, and tests only where nothing else reaches. Captures evidence locally. Use for /verify-web, \"verify this\", or the verify step of the feature and bug-fix playbooks."
disable-model-invocation: true
---

# Verify web

Exercise the real app the way a user does and capture proof. "Tests pass" and "it compiles" are not verification. `<plugin root>` is two levels above this skill's folder.

Each criterion ends as **PASS**, **FAIL**, or **INCONCLUSIVE**. Inconclusive is never a pass. Report it as inconclusive and say what was missing.

## 1. Gather the criteria and the evidence folder

```bash
repo=$(git rev-parse --show-toplevel)
branch=$(git rev-parse --abbrev-ref HEAD | tr / -)
ev="$repo/.astack/evidence/$branch"
exclude="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
mkdir -p "$ev" "$(dirname "$exclude")"
git -C "$repo" check-ignore -q .astack/evidence/x || echo ".astack/evidence/" >> "$exclude"
echo "$ev"
```

Shell variables do not survive between Bash calls. Use the printed paths and the port literally in later steps.

- Read the criteria from `$repo/.astack/spec/<branch>.md`. With no file, use the criteria in your brief. With neither, run the **spec** skill first.
- For a bug repro, the criterion is the repro itself: the request, page, or test that shows the bug.
- Evidence stays local in `$ev`. Never `git add` it and never push it. The **opening-a-pr** playbook pushes images and traces with `evidence.ts`.

## 2. Use the project's own verify skill first

If `.claude/skills/verify*/SKILL.md` exists in the repo, follow it. Use its launch, doctor, drive, and cleanup steps and its feature map, and drive every criterion through it. Write the evidence to `$ev` and report in the shape of step 6. With several, pick the one whose description names the surface you changed. Skip steps 3 to 5.

With no project verify skill, continue here. After the run, suggest the **create-verification-skill** skill in one line.

## 3. Start the dev server

- **Command.** `node <plugin root>/scripts/config.ts get devServer` prints `{command, basePort, readyPath?}`. If the key is unset, use the dev-server recipe from the **pack-<p>** skill of each active pack (`node <plugin root>/scripts/detect.ts`).
- **Port.** If your brief or this session has the JSON from `worktree.ts create`, use its `port`. Otherwise use `basePort`, or 3100 when unset. The port must be free before you start: `lsof -nP -iTCP:$port -sTCP:LISTEN` prints nothing. If it is taken, you did not start that process, so pick the next free port and never drive the other instance.
- **Launch.** Start it in the background with its log in the evidence folder and keep the PID:

  ```bash
  (PORT=$port exec <command> > "$ev/server.log" 2>&1) & echo $! > "$ev/server.pid"
  ```

  Pass the port flag too when the pack recipe names one.
- **Ready.** Poll `http://127.0.0.1:$port<readyPath>` (default `/`) once a second for at most 60 seconds. Ready means a status below 500. Not ready in time → stop the server, report `BLOCKED: dev server not ready` with the last 40 lines of `server.log`, and verify nothing.

## 4. Drive each criterion

**`[http]`.** Run the request with `curl -sS -i` against `127.0.0.1:$port`. Save the exact command and the full response (status line, headers, body) to `$ev/<n>-http.txt`. Compare status and fields with the criterion. A mutation also needs a second read that shows the stored result.

**`[browser]`.** Pick the first driver that works:

1. **Playwright** if `npx --no-install playwright --version` succeeds. Write `$ev/drive.mjs` and run it with `node`. Launch Chromium, start tracing with screenshots and snapshots, record console errors and page errors, open the route, perform the action by role and accessible name, assert the visible result, take a screenshot, and stop tracing to `$ev/<n>-trace.zip`. Save the screenshot as `$ev/<n>-<slug>.png` and the console errors as `$ev/<n>-console.txt`. If the browser binary is missing, run `npx playwright install chromium` once and retry. Any console error the change caused is a FAIL.
2. **Claude in Chrome** if its tools are loaded or listed as deferred (load deferred ones with `ToolSearch`). Navigate, act, read the page and the console messages. Save each step, what you saw, and the console output to `$ev/<n>-chrome.txt`.
3. **Neither.** Print `Skipped: no browser driver`. The criterion is INCONCLUSIVE.

**`[test]`.** Run the named command. Save the command, its output, and its exit code to `$ev/<n>-test.txt`.

Drive the real user path. No test-only endpoints, no setting state from outside. A criterion you could not reach is INCONCLUSIVE with the step attempted and what blocked it, never a pass through another path.

## 5. Stop the server

Always, including after a failure or a blocked start. Kill only what you started:

```bash
pid=$(cat "$ev/server.pid"); pkill -TERM -P "$pid"; kill "$pid"
lsof -tnP -iTCP:$port -sTCP:LISTEN | xargs kill 2>/dev/null
```

The port was free before launch, so its listener is yours. Confirm the port is free again. Evidence stays in `$ev`.

## 6. Report

One row per criterion:

| # | Criterion | Surface | Result | Evidence |
|---|---|---|---|---|
| 1 | POST /api/notes/42/archive returns 204 | http | PASS | `.astack/evidence/feat-archive/1-http.txt` |
| 2 | "Archive" removes the note from /notes | browser | INCONCLUSIVE | Skipped: no browser driver |

The overall result is FAIL if any row fails, else INCONCLUSIVE if any row is inconclusive, else PASS. Paste text evidence (requests and responses, console output, test output) inline for the PR's `## How verified`. List the image and trace files separately, since those get pushed later.
