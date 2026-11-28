# Visual parity

**You own pixel-exact equivalence. The baseline is the spec. You do not touch it.** Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states with Playwright (`expect(page).toHaveScreenshot()` or saved PNGs), plus the target when matching two implementations. No baseline, no parity claim. It is a blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and say so. Don't edit it.
3. Migrate one component at a time. A step that touches framework code reads the **pack-<p>** skill for each active pack. Parallelize across slots, one `resonator:xiangli-yao` owner per component with the `implementer` role, per the router's parallel-writer rule (**principle-separate-before-serializing-shared-state**). Shared primitives (tokens, base styles, layout shells) migrate first as a blocking phase.
4. Verify each component against its baseline by image diff in a real browser with a **verify-web** run in a `verify` agent, per the router's long-loop rule. It returns the diff numbers and image paths. Pin viewport, fonts, and animations so the diff is stable. A nonzero diff is a fail. Investigate the pixel delta. Repeat per component until the diff is zero.
5. Run the **opening-a-pr** playbook per component or per safe batch. Attach the diff images as evidence.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.
