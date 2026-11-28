---
name: pr-review
description: "Use for \"review my PR\", \"self-review\", or \"pr-review\". Read-only reviewer agents check a PR's diff in parallel. The lead verifies each finding, fixes the real ones, and posts one PR comment with every finding and its verdict."
disable-model-invocation: true
---

# PR review

Reviewers read the diff. You verify every finding before you touch code. A finding you cannot reproduce or trace is rejected, with the reason written down. The result is one PR comment, not a thread per line.

`<plugin root>` is two levels above this skill's folder. The **opening-a-pr** playbook runs it after evidence. Fixes land here so the comment can name their commits.

## 1. Scope

- PR number: the one your caller gives, else `gh pr view --json number -q .number`. With no PR, review the branch and skip posting in step 6.
- Base: `gh pr view <n> --json baseRefName -q .baseRefName`, else the repo's default branch.
- Range: run `git fetch origin <base>`, then `git merge-base origin/<base> HEAD`. The range is `<merge-base>..HEAD`. Commit or stash first so the range holds the whole change.
- Packs: the active packs your caller named, else the JSON array that `node <plugin root>/scripts/detect.ts` prints.

## 2. Pick reviewers

| Agent | Role for model | Runs |
|---|---|---|
| `review-correctness` | `review-correctness` | always |
| `review-security` | `review-security` | always |
| `review-performance` | `review-performance` | always |
| `review-api` | `review-api` | always |
| `zhezhi` | `review-frontend` | only when the diff touches UI files |

The diff touches UI files when this prints a path:

```bash
git diff --name-only <range> | grep -E '\.(vue|tsx|jsx|svelte|css|scss|html)$|(^|/)(pages|components|app|layouts)/'
```

## 3. Fan out

For each reviewer, run `node <plugin root>/scripts/config.ts model <role>`. It prints `<model> <effort>`. Spawn every reviewer in one message with the `Agent` tool, `subagent_type: "resonator:<agent>"`, and the printed `model` and `effort`. The brief is the range, the packs, the absolute `<plugin root>`, the absolute path of the PR's checkout (the PR slot under the **resonator** router), and the PR title and `## Why` as intent. Seats run git there with `git -C <path>` and read files under that path.

A reviewer that fails or replies off-format drops out. Name it in the comment and continue with the rest.

## 4. Merge

Parse each `- file:` block into file:line, claim, and scenario. Drop blocks with no scenario. When two blocks share a file:line and make the same claim, keep one and list both reviewers. Number the survivors.

## 5. Verify, then fix

Treat each finding as a hypothesis. Accept it only with proof:

- **Reproduce.** Run the scenario against the real code: a failing test, a `curl` against the dev server, or a short script. Keep the command and its output.
- **Trace.** When a run is not practical, such as a race or a missing index, walk the code path from the input in the scenario to the wrong result. Cite each file:line on the way.

Reject a finding when the run shows the right result, when the trace breaks (a guard upstream, a type that forbids the input), when the base branch already has the problem, or when the scenario needs a change that does not exist yet. Record the reason in one line, such as `rejected: auth middleware on server/api/orders/** checks owner first`.

Fix the accepted findings in the PR's checkout: the PR slot under the **resonator** router, else the current checkout of the PR branch. Delegate each fix to `resonator:xiangli-yao` with the caller's code role, or `implementer` when run alone, under the router's writer rule: no `isolation`, the brief names the checkout path and the branch, the writer commits there and never pushes, and you wait for it. The brief carries the finding, its proof, and the range. Each fix lands as its own commit on the branch, per the **commit** skill. Rerun the proof and confirm it now passes. Push with `git push -u origin HEAD`, never with force, before you post. Record `fixed <short sha>`, the fix commit that push published. A fix whose proof still fails goes back for another round.

## 6. Post one comment

Write the body to a file:

```markdown
## Self-review

Reviewers: review-correctness, review-security, review-performance, review-api, zhezhi (skipped: no UI files)
Range: `<merge-base short sha>..<head short sha>`

| # | Reviewer | File:line | Finding | Failure scenario | Verdict |
|---|---|---|---|---|---|
| 1 | review-security | `server/api/orders/[id].get.ts:18` | Loads any order by id without an owner check. | User A requests order 42, owned by B, and gets B's address. | fixed a1b2c3d |
| 2 | review-performance | `pages/orders.vue:31` | Fetches each order's customer in a loop. | 50 orders, 50 queries. | rejected: the loader batches by id, see server/utils/customers.ts:12 |
```

Escape any `|` inside a cell as `\|`. With no findings, replace the table with `No findings.` and keep the reviewer line.

Post it: `gh pr comment <n> --body-file <file>`. It prints the comment URL.

If `gh` fails or there is no PR, print the table and this line, then continue:

```
Skipped: could not post review comment
```

## Reply

The comment URL (or the skip line), counts of fixed and rejected findings, and the fix commits. The caller links the URL from its PR summary.
