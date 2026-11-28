# Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. **Slot.** Make the PR slot per the router's Mechanics, `cd` into it, and run every step below from there. A phoebe owner is already in its slot.
2. **Sharpen.** Run the **spec** skill on the feature description. There is no human gate. Continue with labeled guesses. Guesses and open questions go in the spec's `### Guesses` and `### Open questions`, which the PR's `## Spec` carries. Stop only when an unknown would change the whole feature, such as two incompatible readings of the spec.
3. **Architect.** Trace the affected subsystem. Run the **architect** skill for the data shape, types, and module boundaries before any logic. A step that touches framework or runtime code reads the **pack-<p>** skill for each active pack.
4. Write the throughput checkpoint as four task items. A dimension that does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, routes, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (**principle-separate-before-serializing-shared-state**). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
5. **Implement.** Delegate code-writing to `resonator:xiangli-yao` with the `implementer` role, working in the PR slot per the router's writer rule. Give it a specific scope: file paths, the named data shape and its organizing structure per **principle-model-the-domain** (a state machine over scattered booleans, a table over branching, a typed model over repeated shape assumptions), the active packs, and success criteria. The brief also says TDD where cheap (the **tdd** skill), with tests that assert what users of the code observe (**principle-test-behavior-not-implementation**). When the implementation admits several valid shapes (error handling, abstraction layer, test structure), delegate through the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. This is mandatory. The Laziness Protocol does not override it, since the gain is review separation, not lines saved. Surgical edits. Commit liberally.
6. **Verify.** Hand the **verify-web** run to a `verify` agent per the router's long-loop rule, with the brief in **verify-web** §Delegated run. It drives the running app: a real browser for UI, HTTP against a running server for backend. Its `report.md` is the PR's evidence. "Inconclusive" or wrong-surface is not a pass. Flag it.
7. Rebase into small, ordered commits. Stack follow-ups. Use **principle-sequence-verifiable-units**, building, verifying, and committing each small unit before the next.
8. If the design is contested, run the **interrogate** skill before shipping.
9. Run the **opening-a-pr** playbook.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-route investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open questions, the PR link. Tables for design alternatives.
