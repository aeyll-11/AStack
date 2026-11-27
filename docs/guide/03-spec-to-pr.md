# Spec to PR

The `feature` playbook takes a description to a green PR.

```
/astack:astack <feature description>
```

## Steps

1. **Sharpen.** The **spec** skill writes goal, acceptance criteria, labeled guesses, and open questions. There is no human gate. Guesses carry on into the PR's `## Open questions`.
2. **Architect.** The **architect** skill fixes data shape, types, and module boundaries before logic.
3. **Implement.** An `xiangli-yao` agent in its own worktree writes the code. When several valid shapes exist, the **arena** skill runs competing candidates.
4. **Test.** Tests assert observable behavior. TDD where it is cheap.
5. **Verify.** The **verify-web** skill drives the running app. See [verification and review](05-verification-and-review.md).
6. **Open the PR.** The `opening-a-pr` playbook takes over.

## The PR tail

1. Run **no-comments**, then **unslop** on the diff prose.
2. Open a draft PR. The body has `## Why`, `## What changed`, `## How verified`, and `## Open questions`, at most 40 lines.
3. Push screenshots and traces with `node <plugin root>/scripts/evidence.ts push --pr <n> <files...>`.
4. Self-review with **pr-review**, then fix real findings.
5. **shorekeeper** watches CI.
6. On green, mark ready, request review, post the summary comment, and send the push notification.

On red past `ciRetries`, or on a conflict, the PR stays draft and the comment names the failing checks.

## Other code playbooks

`verina` (bug), `perf`, `refactoring`, and `visual-parity` end in the same `opening-a-pr` tail. `multi-phase-plan` splits work into several PRs. `prototype` settles a design fork and throws the code away, so it opens no PR.
