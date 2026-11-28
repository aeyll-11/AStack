---
name: resonator-help
description: Guides users through Resonator setup, /resonator:resonator, and picking the skill, playbook, or principle for a task. Type /resonator:resonator-help with a question.
disable-model-invocation: true
---

# Resonator help

Answer the user's question about Resonator, hand them a prompt they can send, and name the file the answer came from. For a help question, don't start the work. The user asked how, and an Resonator run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use resonator to fix this bug", is not a help question. Read `<plugin root>/skills/resonator/SKILL.md`, do the work under it, and mention once that `/resonator:resonator <task>` is the way in. `<plugin root>` is two levels above this skill's folder.

This file maps questions to the skills that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. Paths below are relative to `<plugin root>`. Give the user the skill name and the typed form, since the user may not browse the plugin folder.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with AskUserQuestion and these options, then answer only the section they pick:

- Get set up
- Start a task with `/resonator:resonator`
- Pick a skill for a situation
- Fix a run that went wrong
- Make Resonator my own

Check the state that changes the answer, and mention it only when it does:

- `node <plugin root>/scripts/config.ts get configured` exits 1 or prints `false` means `/resonator:setup-resonator` hasn't run for this user, so every role uses its suggested model.
- No project-local `verify-*` skill means agents have no scripted way to drive the app. Mention `/resonator:create-verification-skill` when the question is about proving a change works.

When setup hasn't run and it matters, ask whether the user wants to pick a model for each role now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. Offer two choices:

- Now: give them `/resonator:setup-resonator` to type, and answer their question too.
- Later: answer their question, and add one line saying every role keeps its suggested model until they run `/resonator:setup-resonator`.

## Get set up

1. Install with `/plugin marketplace add` and `/plugin install resonator@resonator`.
2. Type `/resonator:setup-resonator`. It shows the detected stack packs, asks you to pick a model and effort for each role, then sets the issue source, notifications, dev server, router hook, and a permission allowlist. It lists competing workflow plugins and tells you how to disable them. It never disables anything itself.
3. Start a real task with `/resonator:resonator`, a goal, and a check that can pass or fail.

Installing changes nothing until the user types a skill. Offer to word their first prompt with them, per `skills/resonator-help/references/prompting.md`.

If cost is the worry, say where the tokens go and how to spend fewer. Resonator spends extra tokens on subagents and review panels. Rerun `/resonator:setup-resonator` and pick cheaper models or lower effort for roles that don't need rigor. Save `/resonator:resonator` for work that needs it.

Resonator runs on Claude Code only. Only Claude models are available, picked per family (`opus`, `sonnet`, `haiku`, `fable`). A step that needs something the machine lacks, such as a GitHub remote or Playwright, degrades with a one-line note.

## Start a task with `/resonator:resonator`

`/resonator:resonator` matches the task to a playbook, copies the playbook's steps into the task list, and runs the other skills as the steps need them. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read `skills/resonator-help/references/prompting.md` before you help word one.

Claude Code has no custom modes, so the router stays on through a `SessionStart` hook that points every non-trivial task at it. `/resonator:setup-resonator` turns that hook on or off. With it off, start each task with `/resonator:resonator`.

Mid-chat, "new task" makes the router match a fresh playbook. For a subagent of your own that works in the Resonator style, spawn it with `subagent_type: "resonator:xiangli-yao"`.

## Pick a skill

The default answer is `/resonator:resonator`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | `/resonator:resonator` |
| Turn a feature description or issue into goal, acceptance criteria, and open questions | `/resonator:spec` |
| Check that the agent understood their goal and the problem before it starts | `/resonator:in-your-own-words` |
| Get a prompt rewritten deeper, not bigger, before sending it. It returns the prompt and doesn't do the task | `/resonator:sharpen` |
| Know how code works now, or where new code should live | `/resonator:how` |
| Know why code is shaped this way, or where a number came from | `/resonator:why` |
| Catch up on their own recent work on a topic | `/resonator:recall` |
| Catch up on what changed in this chat since their last message, with every item waiting on them listed | `/resonator:ketchup` |
| Know what a small diff could break outside itself | `/resonator:blast-radius` |
| Settle types and module shape before code that crosses a function boundary | `/resonator:architect` |
| Get several attempts at one brief, merged into the best one | `/resonator:arena` |
| Run parallel checks over slices, or race workers, and get one report | `/resonator:swarm` |
| Review a PR's diff with the reviewer panel and verified findings | `/resonator:pr-review` |
| Have different models review a diff and try to break it | `/resonator:interrogate` |
| Watch CI and review threads until green, fixing red runs within a retry bound | `/resonator:shorekeeper` |
| Fix a bug test-first when a cheap local test exists | `/resonator:tdd` |
| Apply TypeScript rules to `.ts` or `.tsx` work | `/resonator:typescript-best-practices` |
| Strip comments before review, using a reviewer that didn't write them | `/resonator:no-comments` |
| Clean AI tells out of prose | `/resonator:unslop` |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | `/resonator:technical-writing` |
| Prove behavior against the running app, over HTTP or in a browser | `/resonator:verify-web` |
| Give agents a scripted way to drive the app and prove behavior | `/resonator:create-verification-skill` |
| Bring a verification skill and its feature map back in line with the app | `/resonator:maintain-verification-skill` |
| Vet a performance number before reporting or acting on it | `/resonator:benchmark-checklist` |
| Run a large or cross-cutting change, or one to review after stepping away | `/resonator:figure-it-out` |
| Keep a decision log during a run, and review it afterward | `/resonator:show-me-your-work` |
| Pick a model and effort for each role, and configure the project | `/resonator:setup-resonator` |
| Turn what a finished task taught into skill edits | `/resonator:reflect` |
| Stop agents from repeating the same mistakes in this repo | `/resonator:correct` |
| Find their way around Resonator | `/resonator:resonator-help` |

The `pack-*` skills (`pack-nuxt`, `pack-node`, `pack-bun`) hold stack facts. The router reads them for the packs it detects, and the user rarely types them. If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/resonator:how` explains what the code does. `/resonator:why` explains the reasons.
- `/resonator:arena` gives every worker the same brief and merges the best parts. `/resonator:swarm` splits work into slices or a race and returns one report.
- `/resonator:pr-review` runs the reviewer panel over a PR. `/resonator:interrogate` is a panel of three seats that challenges a diff or a contested design. `/resonator:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/resonator:recall` rebuilds context across recent chats. `/resonator:ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the session-pickup playbook.
- `/resonator:figure-it-out` designs one rigorous run. The phoebe playbook drives a whole issue queue.

Not in Resonator:

- `/loop` and `/schedule` are Claude Code built-ins.
- Resonator has no standalone planning skill. The multi-phase-plan playbook writes plans.

## Playbooks and principles

Playbooks are step lists in `skills/resonator/playbooks/`, not skills, so they have no slash command. Type `/resonator:resonator <task>` and describing the task picks one. These phrases name one directly:

- `feature`: "add <behavior>". Spec, architect, implement, test, verify, PR.
- `verina`: "fix <bug>". Reproduce first, root-cause, fix, verify.
- `perf`: "<page> is slow". Baseline, fix, re-measure.
- `refactoring`: "move <code>, zero behavior change".
- `investigation`: "how does X work", "are we sure". Read-only.
- `prototype`: "prototype options for <feature>". A throwaway sketch to settle a design fork.
- `visual-parity`: "match this screenshot".
- `phoebe`: "work the issue queue". Takes issues from GitHub or Linear through the feature pipeline.
- `babysit`: "babysit this pr" or "check on pr 123". Drives the PR to green and stops there. Resonator never merges.
- `opening-a-pr`: the shared tail of every code playbook.
- `multi-phase-plan`: "plan the migration". Writes the plan and doesn't implement it.
- `session-pickup`: "take over this branch".
- `pause-safely`: "pause safely".
- `worktree-cleanup`: "clean up worktrees".

The Playbooks section of `skills/resonator/SKILL.md` lists every playbook. For a design question, the prototype playbook or `/resonator:architect` settles it in code first.

Principles are one-rule skills that `/resonator:resonator` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/resonator:principle-<name>` still loads one on demand. The 24 are `attack-the-premise`, `boundary-discipline`, `build-the-lever`, `encode-lessons-in-structure`, `exhaust-the-design-space`, `experience-first`, `explain-the-number`, `fix-root-causes`, `foundational-thinking`, `guard-the-context-window`, `laziness-protocol`, `make-operations-idempotent`, `migrate-callers-then-delete-legacy-apis`, `minimize-reader-load`, `model-the-domain`, `never-block-on-the-human`, `outcome-oriented-execution`, `prove-it-works`, `redesign-from-first-principles`, `separate-before-serializing-shared-state`, `sequence-verifiable-units`, `subtract-before-you-add`, `test-behavior-not-implementation`, and `type-system-discipline`.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The router stopped applying after a few turns | The `SessionStart` hook is off or the session predates it. Run `/resonator:setup-resonator` to turn it on, or start each task with `/resonator:resonator`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the router. |
| A new model choice had no effect | Config is read at spawn time. Run `node <plugin root>/scripts/config.ts model <role>` to confirm the stored value, then start a new task. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | The skills load when the user types them or when `/resonator:resonator` runs them, and it doesn't run every skill. |
| Another plugin's skills keep firing | Workflow plugins such as superpowers compete with Resonator. Rerun `/resonator:setup-resonator`, which names them and gives the `claude plugin disable <name>` command. |
| Parallel agents overwrote each other | Give each agent its own worktree. |
| An overnight run moved but finished nothing | A loop needs a check that can pass or fail, not a duration. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, `skills/resonator-help/references/prompting.md` has one-line steers.

## Make Resonator my own

- `/resonator:setup-resonator` changes any role's model or effort at any time. The user file is `~/.claude/resonator/config.json` and the project file is `.resonator/config.json`.
- `/resonator:reflect` after a session turns its lessons into skill edits the user approves.
- `/resonator:correct` makes a repeated mistake structurally impossible.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from `skills/resonator-help/references/recipes.md` when one fits, then name that file. Keep it short unless the user asked for the whole map.
