---
name: shorekeeper
description: "Watch a PR's CI until it is green. On a red run, diagnose the root cause, fix, push, and watch again, within a retry bound. Returns green, escalated, conflict, or closed to its caller. Never merges. Use for /shorekeeper, \"watch CI\", or the CI step of the opening-a-pr and babysit playbooks."
disable-model-invocation: true
---

# Shorekeeper

Shorekeeper watches over one PR until its checks are green. A red run gets **Encore**: find the root cause, fix it, push, and watch again. Encore has a bound. Past it, the human decides.

`<plugin root>` is two levels above this skill's folder. Shorekeeper never merges, never force-pushes, and never rebases. It never marks the PR ready or notifies anyone. It returns a result, and the caller decides what happens next.

## Inputs

- **PR number.** From the caller, else `gh pr view --json number -q .number`.
- **Code role.** The caller's playbook names it: `implementer` by default, `bugfix` under the verina playbook.
- **Branch ownership.** The caller says whether Resonator owns the PR's branch. Opening-a-pr always does. In babysit, Resonator owns only branches it created.
- **Retry cap.** `node <plugin root>/scripts/config.ts get ciRetries` prints it. The default is 3.

Start with `encore = 0` and `pushed` unset. You keep both, and every decision below.

## 1. Spawn the watcher

Polling is a long, mechanical loop. Under the **resonator** router's long-loop rule it runs in a `verify`-role agent. Spawn `resonator:xiangli-yao` in the background with no `isolation`, and the `model` and `effort` from `node <plugin root>/scripts/config.ts model verify`. The brief is `Read <plugin root>/skills/resonator/worker.md before anything else.`, the goal, the absolute `<plugin root>`, the PR number, the slot path, `pushed` when set, and `Read <plugin root>/skills/shorekeeper/SKILL.md and run only its Watch section. Do not edit, commit, or push.` Wait for it. With no `Agent` tool, run the Watch section yourself.

## Watch

This is the watcher's whole job. Poll:

```bash
node <plugin root>/scripts/watch-pr/cli.ts <n> --once --json
```

It prints one line, such as `{"state":"red","head":"9f3c2e1…","failing":[{"name":"test (node 22)","link":"https://github.com/acme/web/actions/runs/123/job/456"}],"unresolvedThreads":1}`. The exit code says how to read it:

- **0**: act on `state`, below. If `pushed` is set and `head` differs from it, GitHub has not caught up with the push yet, and its checks belong to the old commit. Treat the result as `pending`, whatever `state` says.
- **2**: `resonator: GitHub unavailable: <reason>`. `gh` is missing or not logged in. Return `escalated` with that message.
- **7**: the status query failed. The detail is on stderr. Poll again after the next wait. After three failures in a row, return `escalated` with the detail. One exception: if the detail says no checks were reported on the branch, and it still says so after three polls, the repo runs no CI on this PR. Return `green` with `no checks`.
- **Any other exit**: return `escalated` with its stderr.

On `pending`, wait and poll again. Start at 60 seconds. Double the wait each time the state stays pending, and cap it at 300 seconds. Use the `Monitor` tool with an until-loop over the poll command, or `ScheduleWakeup`, when either is offered. Otherwise run `sleep` in steps of at most 300 seconds. If checks stay pending for 60 minutes, return `escalated` and say the checks are stuck.

Any other state ends the watch. On `red`, save each failing run's log. Each `failing` link names its run, as in `/actions/runs/<run-id>/`: `gh run view <run-id> --log-failed > <tmp>/ci-<run-id>.log`. A link outside GitHub Actions gets no file.

Return one line: the state (`green`, `red`, `conflict`, `closed`, or `escalated`), each failing check by name and link, the log paths, `unresolvedThreads`, and any reason. Never paste log contents.

## 2. Act on the result

- **green.** Return `green`. Pass on `no checks` when the watcher said it.
- **escalated.** Return `escalated` with the watcher's reason.
- **red.** If no check failed, return `escalated` and say GitHub refuses the merge while every visible check passes. If `encore` is at or above the retry cap, Encore is spent. Return `escalated`. Otherwise run Encore (step 3).
- **conflict.** Run the conflict pass (step 4).
- **closed.** Someone closed or merged the PR outside this loop. Clean up its slot, then return `closed`. Take the head branch from `gh pr view <n> --json headRefName -q .headRefName` and find the slot path from `git worktree list --porcelain`. When that path is under `.worktrees/`, run `node <plugin root>/scripts/worktree.ts remove --branch <head>`, never with `--force`. It refuses a slot with uncommitted changes, exits 1, and lists them. Then keep the slot and report its path and the files it listed.

## 3. Encore

1. **Read the failing part.** Never read a whole log. Find the first error with `grep -n -m 20 -iE 'error|fail|assert' <log>`, then read about 40 lines around it with `sed -n`. A failing link outside GitHub Actions comes from an external CI. Open it with the tools you have. If you cannot reach that log, return `escalated`.
2. **Find the root cause.** Read the **principle-fix-root-causes** skill. Trace the failure to the first place the system went wrong. Reproduce it locally with the same command the job ran, such as `npm test -- src/cart.test.ts` or `npx playwright test checkout.spec.ts`. Pipe its output through `tail`.
3. **Flake gets one rerun.** If the failure is outside the diff and does not reproduce locally (a network timeout, a runner crash), rerun once with `gh run rerun <run-id> --failed`. Only the diff's own failures get a commit. A second failure of the same job is not a flake.
4. **Fix.** Spawn `resonator:xiangli-yao` with the code role. Run `node <plugin root>/scripts/config.ts model <role>` and pass the `model` and `effort` it prints. It works in the PR's slot, else the current checkout of the PR branch, under the **resonator** router's writer rule: no `isolation`, the brief names the slot path and branch, it commits there per the **commit** skill and never pushes, and you wait for it. The first line of the brief is `Read <plugin root>/skills/resonator/worker.md before anything else.` Then give the goal, the failing job, the log file's path, and the root cause. Review the diff yourself. Rerun the failing command locally. Push with `git push -u origin HEAD`, never with force, then set `pushed` to `git rev-parse HEAD`.
5. **Count it.** `encore += 1`. A flake rerun counts too. Go back to step 1 with a fresh watcher.

## 4. Conflict pass

You get one attempt.

- **Resonator owns the branch.** In the PR's slot, run `git fetch origin <base>`, then `git merge origin/<base>`. Resolve the conflicts by keeping both sides' intent. Run the tests, commit the merge per the **commit** skill, and push without force. Set `pushed` to `git rev-parse HEAD`. Delegate code-heavy resolutions to `resonator:xiangli-yao` as in Encore step 4. Then go back to step 1.
- **Anyone else's branch.** Make no attempt.

A PR that is still conflicting after the attempt, or one you may not touch, returns `conflict`. Name the branch that needs the rebase.

## Review threads

`unresolvedThreads` counts open review threads. Shorekeeper does not reply to them or resolve them, and they never block `green`. Report the count to the caller, which handles the threads itself.

## Return

Reply to the caller with:

- **Result**: `green`, `escalated`, `conflict`, or `closed`.
- The PR link, and `encore` against the cap, such as `encore 2/3`.
- Each fix: its root cause in one line and its commit link.
- For `escalated`: every failing check by name and link, and what you tried. The PR stays draft.
- For `conflict`: the base branch, the conflicting paths, and whether a merge was attempted.
- `unresolvedThreads`, when it is above zero.
