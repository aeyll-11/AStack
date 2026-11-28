# Spec to PR

The `feature` playbook takes a description to a green PR.

```
/resonator:resonator <feature description>
```

## Steps

1. **Slot.** The lead fetches and makes a worktree slot on a new PR branch `resonator/<slug>`, cut from trunk. Every later step runs there.
2. **Sharpen.** The **spec** skill writes goal, acceptance criteria, labeled guesses, and open questions. There is no human gate. The whole spec goes into the PR's `## Spec`.
3. **Architect.** The **architect** skill fixes data shape, types, and module boundaries before logic.
4. **Implement.** An `xiangli-yao` agent writes the code in the slot while the lead waits. Its brief asks for TDD where it is cheap, with tests that assert observable behavior. When several valid shapes exist, the **arena** skill runs competing candidates.
5. **Verify.** The **verify-web** skill drives the running app. See [verification and review](05-verification-and-review.md).
6. **Open the PR.** The `opening-a-pr` playbook takes over.

## The PR tail

1. Run **no-comments**, then **unslop** on the diff prose, and push the branch.
2. Open a draft PR. The body has `## Why`, `## Spec` (the spec file verbatim), `## What changed`, `## How verified`, and `## Open questions` (only questions raised after the spec). It is at most 40 lines, not counting the spec.
3. Push screenshots and traces with `node <plugin root>/scripts/evidence.ts push --pr <n> <files...>`.
4. Self-review with **pr-review**. It fixes real findings, pushes, and posts one review comment. Criteria the fixes touch are verified again.
5. **shorekeeper** watches CI.
6. On green, mark ready and request review. The request is skipped when the reviewer would be the PR's author. Post the summary comment, which links the review comment, and send the push notification.

On red past `ciRetries`, or on a conflict, the PR stays draft and the comment names the failing checks.

## Other code playbooks

`verina` (bug), `perf`, `refactoring`, and `visual-parity` end in the same `opening-a-pr` tail. `multi-phase-plan` splits work into several PRs. `prototype` settles a design fork and throws the code away, so it opens no PR.
