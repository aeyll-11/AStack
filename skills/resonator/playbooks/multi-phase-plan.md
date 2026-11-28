# Multi-phase or multi-PR plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the operator audits from the evidence.** The plan is the deliverable. Do not implement.

1. When the change is one or two files with an obvious approach, skip the plan. Say so and route to **feature**.
2. Settle open questions with the **prototype** playbook before you write. Ask the operator only about a product or preference call that no run can settle.
3. Write the plan file under `docs/plans/`. Open with what changes, the PR ids in landing order, and the dependency graph: which PRs are independent and branch from trunk, which wait for which, and the files each may touch. Then one section per PR. One PR is one change with its own evidence (**principle-sequence-verifiable-units**). Each section has checkboxes for what it depends on, the files it edits, the one change it builds, the result you see, and its verification.
4. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Each live box drives the real app with a **verify-web** run in a `verify` agent, per the router's long-loop rule, against a concrete scenario and a pass predicate. The perf box names the metric, the probe, the trunk baseline measured first, and the number that fails (see the **perf** playbook).
5. Each PR in the plan runs its code playbook and ends in the **opening-a-pr** playbook. No PR merges itself. A human reviews and merges each one.
6. Hand back the plan path and stop. Execution starts on the operator's explicit go.

**Reply:** the plan path, the PR ids with their dependencies, and what stays unproven.
