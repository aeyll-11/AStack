# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/astack:astack read <thread>. restate the underlying issue in your own words, in plain english.`
- `/astack:in-your-own-words <long or messy ask>`
- `/astack:sharpen <the prompt you're about to send>`
- `/astack:astack investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /astack:how to understand <subsystem>. then use /astack:why to find out why it broke recently.`
- `/astack:recall my work on <topic> from last week, then read <issue>.`
- `explain why you implemented it this way and not <other way>. what did you trade off?`
- `/astack:astack take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/astack:astack <symptom>. repro first, then fix and verify.`
- Bug in an app: `/astack:astack repro this with /astack:verify-web. if it repros on main, fix it and show me the captured evidence as proof.`
- Bug with a cheap test: `/astack:astack repro <bug> first. if there's a cheap test path, /astack:tdd it. then fix and rerun.`
- Feature: `/astack:astack add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/astack:astack move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/astack:astack <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/astack:astack prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/astack:astack we need <feature>. /astack:architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/astack:astack write a tutorial for how i would use <new package> first. then explain why it beats the current one.`
- `ask /astack:arena for a second opinion on this thread and our approach.`
- `/astack:astack turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/astack:astack plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/astack:interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.`
- `/astack:swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/astack:astack open the pr. small ordered commits, evidence in the description.`
- `/astack:astack babysit this pr. get it green.` For status only: `/astack:astack check on pr <number>. anything outstanding?`
- `/astack:astack land the stack.`

## Away and back

- `/astack:astack im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. keep going until done. if you're truly stuck after a few hours, stop and write up why.`
- `/astack:show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/astack:ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/astack:astack full autopilot on this queue. each item is independent.`
- `/astack:astack autopilot these changes, but don't merge. i'll land them.`
- `/astack:reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
