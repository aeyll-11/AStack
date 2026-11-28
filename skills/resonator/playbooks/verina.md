# Bug fix

**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents. Stay in the lead.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix, and it does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

1. **Reproduce first.** No repro, no fix. Make it fire yourself on the matching surface with one of these:
   - a failing test that captures the bug,
   - a **verify-web** run driving the page in a real browser, in a `verify` agent per the router's long-loop rule (brief in **verify-web** §Delegated run),
   - `curl` against the running server, with the request and the wrong response saved.

   Ask the user only with a stated, specific reason none of these reaches the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
2. **Root-cause** per **principle-fix-root-causes**. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with a trace of the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add logging and read it as the code runs. Don't guess. Confirm the surviving *mechanism* with runtime evidence before step 3. For a hang, leak, or spinning process, capture the signal per the **perf** playbook's measurement steps.
3. **Plan the fix.** If it crosses a function boundary, run the **architect** skill first. A step that touches framework or runtime code reads the **pack-<p>** skill for each active pack. Delegate implementation to `resonator:xiangli-yao` with the `bugfix` role in the PR slot, per the router's writer rule, with a specific scope and the repro.
4. **Verify on the same surface.** The original repro now passes. A browser or HTTP repro reruns as a **verify-web** run in a fresh `verify` agent, as in step 1. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear. This is the canonical **principle-sequence-verifiable-units**: the failing test first, the fix on top.
6. Run the **opening-a-pr** playbook.

**Reply:** what was broken, root cause, fix, how you verified. Paste failing-then-passing repro output verbatim.
