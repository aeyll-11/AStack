# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/resonator:resonator read <thread>. restate the underlying issue in your own words, in plain english.`
- `/resonator:in-your-own-words <long or messy ask>`
- `/resonator:sharpen <the prompt you're about to send>`
- `/resonator:resonator investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /resonator:how to understand <subsystem>. then use /resonator:why to find out why it broke recently.`
- `/resonator:recall my work on <topic> from last week, then read <issue>.`
- `explain why you implemented it this way and not <other way>. what did you trade off?`
- `/resonator:resonator take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/resonator:resonator <symptom>. repro first, then fix and verify.`
- Bug in an app: `/resonator:resonator repro this with /resonator:verify-web. if it repros on main, fix it and show me the captured evidence as proof.`
- Bug with a cheap test: `/resonator:resonator repro <bug> first. if there's a cheap test path, /resonator:tdd it. then fix and rerun.`
- Feature: `/resonator:resonator add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/resonator:resonator move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/resonator:resonator <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/resonator:resonator prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/resonator:resonator we need <feature>. /resonator:architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/resonator:resonator write a tutorial for how i would use <new package> first. then explain why it beats the current one.`
- `ask /resonator:arena for a second opinion on this thread and our approach.`
- `/resonator:resonator turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/resonator:resonator plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/resonator:interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.`
- `/resonator:swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/resonator:resonator open the pr. small ordered commits, evidence in the description.`
- `/resonator:resonator babysit this pr. get it green.` For status only: `/resonator:resonator check on pr <number>. anything outstanding?`

## Away and back

- `/resonator:resonator im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. keep going until done. if you're truly stuck after a few hours, stop and write up why.`
- `/resonator:show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/resonator:ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/resonator:resonator full autopilot on this queue. each item is independent.`
- `/resonator:resonator autopilot these changes, but don't merge. i'll land them.`
- `/resonator:reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
