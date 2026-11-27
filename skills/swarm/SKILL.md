---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

`<plugin root>` is two levels above this skill's folder.

## Start

Open a task list with `TaskCreate`, one task per phase, before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on one task, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Get the worker model with `node <plugin root>/scripts/config.ts model mechanical` and pass the printed `model` and `effort` to every worker. When the work needs judgment rather than edits, use the `implementer` role instead and say so. In a race, diversity comes from the briefs. Give each arm one distinct angle, such as a different approach, entry point, or test input, and name each arm's angle up front.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message with `subagent_type: "astack:xiangli-yao"`, `isolation: "worktree"`, and the step 3 `model` and `effort`. Subagents run in the background and notify you when they finish. For read-only work, such as exploration or audits, use `subagent_type: "Explore"`, drop the worktree, and put "do not edit files" in the brief.

When a worker must start from a non-default branch, tell it to check out that branch first.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.
