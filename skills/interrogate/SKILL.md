---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

`<plugin root>` is two levels above this skill's folder.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the **in-your-own-words** skill, from the user's message, the commits, and the PR description. Ask the user with `AskUserQuestion` when the intent is unclear.

## Seat the panel

The panel is three Claude agents. Each seat attacks a different surface, so the briefs differ while the scope and intent stay the same. Get each seat's model with `node <plugin root>/scripts/config.ts model <role>` and pass the printed `model` and `effort`.

| Seat | Role | Attack surface |
| --- | --- | --- |
| Correctness | `review-correctness` | Logic, edge cases, state and ordering, error paths, async races, data that is empty, huge, or malformed. |
| Security | `review-security` | Authz and authn gaps, injection, secrets, SSRF, unsafe deserialization, trust boundaries between client and server. |
| Contracts | `review-api` | Request and response shapes, validation at boundaries, error shapes, backwards compatibility for existing callers. |

Add a seat for another surface the change touches, such as rendering and hydration for a UI change. Reuse the closest role for its model.

## Fan out

Spawn all seats in one message with `subagent_type: "astack:xiangli-yao"` and `isolation: "worktree"`. Copy the scope's uncommitted changes into each worktree, or name the commit to check out. Give each adversary the scope, the intent, its attack surface, and this brief:

> Break this change on your attack surface. Prove each finding with a run against the real code, such as a failing test, a repro script, a `curl` against the dev server, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

If a seat produces nothing, proceed without it and note the dropout.

## Verify

Verify each finding by rerunning its command yourself, per the **principle-prove-it-works** skill. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list. Do not pick a winner or graft.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the seats that found it. Say "no verified findings" when none survive.
- **Dropped**: for each seat, the count of dropped findings and why.
