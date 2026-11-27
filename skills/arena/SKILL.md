---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Open a task list with `TaskCreate`, one task per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify), before launching anything.

`<plugin root>` is two levels above this skill's folder.

## Phase A: Frame

Every candidate gets the same task and the same contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Seat the runners. The default is three. Each runner is a Claude agent spawned with `subagent_type: "astack:xiangli-yao"`. Run `node <plugin root>/scripts/config.ts model implementer` and pass the printed `model` and `effort` to every runner. Diversity comes from the brief, not the model. Give each seat one distinct angle on top of the shared task, such as "start from the data model", "reuse the existing modules and add the least new code", or "design the API a caller wants, then build down to it". Add seats for more design directions. Repeat one angle when the work is generation-bound, not judgment-sensitive.
4. Give each candidate its own output location: `isolation: "worktree"` where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`, per the **principle-separate-before-serializing-shared-state** skill.

## Phase B: Fan out

Spawn all N agents in one message. Each brief has the task, the path to the shared grounding, its seat's angle, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected. Subagents run in the background and notify you when they finish.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, spawn one judge with `subagent_type: "Explore"` and "do not edit files" in its brief. Run `node <plugin root>/scripts/config.ts model lead` and pass `model` and `effort`. The judge is a fresh agent that ran no candidate and never saw your reading of them. Give it the rubric and the candidate paths, labeled by path only, not by seat angle. While you read in Phase D, the judge scores each candidate on each rubric criterion and recommends a base.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the **principle-laziness-protocol** skill.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **principle-redesign-from-first-principles** skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and use the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **principle-prove-it-works** skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
