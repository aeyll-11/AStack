# Session pickup

**You own the resume point. Read the prior trail, don't redo it.**

1. **Locate the prior trail.** A transcript under `~/.claude/projects/<slug>/<session>.jsonl`, where the slug is this workspace's path with `/` and `.` turned into `-`. Stay inside this workspace's slug. Globbing across `~/.claude/projects/*/` reads private chats from unrelated projects. Other trails: a resume note from the **pause-safely** playbook, a **show-me-your-work** log, a pushed branch, or an open PR. Read the last messages first, then scan back for the decision points. Parse a long transcript in an `Explore` subagent ("do not edit files") and keep the reduced timeline here (**principle-guard-the-context-window**).
2. **Reconstruct operational state.** The branch and worktree, what already landed (`git log`, `git diff` against the base), the open tasks, the decisions made, any PR and its CI state. The prior trail is authoritative input. Resist the bias to re-derive it.
3. **Diff done vs pending.** Compare what shipped against what was planned, and name the resume point. Do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass treats the trail as untrustworthy when it's authoritative.
4. **Route the rest.** Send the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup ends here. The routed playbook owns the rest, and a code playbook ends in the **opening-a-pr** playbook.
5. **Verify the inherited claims** against the original goal on the real app (**principle-prove-it-works**). A passing prior self-report is not the proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
