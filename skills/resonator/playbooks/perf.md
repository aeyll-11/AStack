# Perf

**You own the measurement story. Plan, review, verify the numbers.** Tie every fix to a measurement. Don't read source instead of measuring.

1. **Baseline.** Capture a real artifact on the matching surface before any change:
   - Node CPU: `node --cpu-prof <entry>` writes a `.cpuprofile`.
   - Page load or interaction: a Chrome trace from Playwright, `context.tracing.start({ screenshots: true, snapshots: true })` then `tracing.stop({ path })`, or a CDP `Tracing` capture for a performance-panel trace.
   - Web Vitals: `npx lighthouse <url> --output=json --output-path=<file>`, three runs or more.
   - Memory: a heap snapshot via `node --heapsnapshot-signal=SIGUSR2`, or the inspector (`--inspect`, then DevTools Memory).
   - Endpoint latency: repeated `curl -w '%{time_total}'` or a load tool against the running server.

   The capture is a long, mechanical run. Hand it to a `verify` agent per the router's long-loop rule. It returns the numbers and artifact paths, not the artifacts. Vet the baseline, and each later number, with the **benchmark-checklist** skill before you report it.
2. **Reduce the artifact to the smoking gun.** The capture is a fixed dataset. Read it, don't re-run it. Parse large artifacts in a subagent (`Explore`, "do not edit files") per **principle-guard-the-context-window** and keep the reduced finding here. Dump the profile or snapshot into sqlite or JSON, one row per sample, frame, or node, and query it. Walk to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. Map the hot frame to file, symbol, and line. A frame with no source mapping is not yet a diagnosis.
3. **Prove the mechanism before believing it.** Inject logging or timing on the running process, or hotfix the code without reloading, to confirm the hypothesis cheaply (**principle-explain-the-number**). Don't claim a perf ceiling without running it first.
4. Try the performance mantras in order, cheapest first. When an earlier mantra meets the target, stop.
   1. Don't do it. Stop work whose result nothing uses rather than cheapening it.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.
5. **Fix.** Plan from the artifact. If it crosses a function boundary, run the **architect** skill first. A step that touches framework or runtime code reads the **pack-<p>** skill for each active pack. Delegate to `resonator:xiangli-yao` with the `implementer` role in the PR slot, per the router's writer rule. Review the diff. Apply **principle-sequence-verifiable-units**, verifying each attempt before the next.
6. **Re-measure** in a fresh `verify` agent, as in step 1, with the same tool, same conditions, same run count. Diff the before and after artifacts. "Inconclusive" or wrong-surface is not a pass. Flag it.
7. Cite the baseline, post-fix number, and artifacts in the PR's `## How verified`. Run the **opening-a-pr** playbook.

A diagnosis-only request ("why is this slow?") stops after step 3 with a cited finding and no fix.

**Reply:** baseline number, post-fix number, delta, artifact paths.
