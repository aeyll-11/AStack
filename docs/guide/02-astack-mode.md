# Run a task with `/astack:astack`

```
/astack:astack add a dark mode toggle to the settings page
```

The router is the entry point for non-trivial work. With `routerHook` on, a `SessionStart` pointer sends such tasks to it automatically.

## What it does first

1. Runs `node <plugin root>/scripts/detect.ts` and names the active packs.
2. Restates your goal and the smallest change that meets it.
3. Matches the task to a playbook and copies its steps into the task list.

## What you see

- The task list shows each playbook step.
- The reply names each principle that shaped a decision and the choice it changed.
- Spawned agents run in the background. Agents that edit code get their own worktree.

## Autonomy

- Reversible work and external actions, such as issue comments and CI runs, proceed without asking.
- It always pauses for deploys, data deletion, and force-pushes to shared branches.
- It never merges.
- Say "don't stop" or "run until done" to keep it going.
- Asked whether to do something, it gives its real judgment, including no.

## Pick a playbook yourself

Name it in the task: "reproduce and fix this bug" routes to `verina`, "why is this endpoint slow" routes to `perf`. The table is in the [README](../../README.md#playbooks). For one-off help, type a skill directly, such as `/astack:spec` or `/astack:pr-review`. `/astack:astack-help <question>` suggests which.
