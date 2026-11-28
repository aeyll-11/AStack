# Run a task with `/resonator:resonator`

```
/resonator:resonator add a dark mode toggle to the settings page
```

The router is the entry point for non-trivial work. With `routerHook` on, a `SessionStart` pointer sends such tasks to it automatically.

A `PreToolUse` hook on Bash guards every `git commit`. It denies a message with an AI `Co-Authored-By:` or "Generated with Claude Code" line, and an `--author` that is not your git identity. The **commit** skill states the same rules, so the model gets it right the first time.

## What it does first

1. Runs `node <plugin root>/scripts/detect.ts` and names the active packs.
2. Restates your goal and the smallest change that meets it.
3. Matches the task to a playbook and copies its steps into the task list.

## What you see

- The task list shows each playbook step.
- The reply names each principle that shaped a decision and the choice it changed.
- Each code task runs in one worktree slot on its PR branch, cut from trunk. Agents that edit code work in that slot, one at a time, and the lead pushes.

## Autonomy

- Reversible work and external actions, such as issue comments and CI runs, proceed without asking.
- It always pauses for deploys, data deletion, and force-pushes to shared branches.
- It never merges.
- Say "don't stop" or "run until done" to keep it going.
- Asked whether to do something, it gives its real judgment, including no.

## Pick a playbook yourself

Name it in the task: "reproduce and fix this bug" routes to `verina`, "why is this endpoint slow" routes to `perf`. The table is in the [README](../../README.md#playbooks). For one-off help, type a skill directly, such as `/resonator:spec` or `/resonator:pr-review`. `/resonator:resonator-help <question>` suggests which.
