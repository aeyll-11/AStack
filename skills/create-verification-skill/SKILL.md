---
name: create-verification-skill
description: "Generate a project-local verification skill that drives your web app the way a user does: launch the dev server, sign in, seed data, drive routes in a browser and over HTTP, capture evidence. Use for /astack:create-verification-skill, \"make a verify skill for this repo\", or when a project has no scripted way to prove UI or API behavior."
disable-model-invocation: true
---

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behavior: launch it, exercise a feature the way a user would, and capture evidence. This skill generates that as a project-local skill (`.claude/skills/verify-<app>/`) tailored to the repo. The **verify-web** skill uses it before its generic recipe. You write the generator's output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has never seen the app.

## 1. Interview the repo, not the user

Answer these from the codebase and only ask the user what you cannot observe:

- **Surface:** what does a user actually touch? Pages and routes in a browser, a JSON API, server-rendered forms, webhooks? A repo can have several; pick the primary one and note the rest.
- **Run:** how does the app start locally? Prefer the repo's own documented dev command (package scripts, Makefile, README quickstart). Note the port and how to set it, env vars, migrations, seed data, and auth.
- **Drive:** how can an agent interact with it programmatically? Existing harnesses first: Playwright or Cypress specs, API request collections, a seed or fixture script, a test-user factory. Only then pick a generic recipe: Playwright for pages, `curl` for the API.
- **Observe:** what evidence can be captured? Screenshots, ARIA snapshots, Playwright traces, console errors, response bodies, server logs, DB rows.
- **Isolate:** can two instances run side by side (ports, databases, data dirs)? AStack gives each worktree its own port. Say in the generated skill whether the database is shared and what that means for seed data: refusing to double-drive a shared instance beats corrupting the user's session.

If the checkout doesn't build or start as-is, fix that first (or report it precisely) before generating; a skill written against a broken base teaches wrong steps. When an irrelevant missing asset blocks startup (a static dir the API never serves, a sample config), the generated skill may create it, clearly marked as verification scaffolding, and remove it in cleanup.

## 2. Generate the skill

Write `.claude/skills/verify-<app>/SKILL.md` with YAML frontmatter (`name: verify-<app>` and a `description` that names the app, the surface, and when to reach for it; without frontmatter the skill never registers) and these sections, each grounded in what the interview actually found (no placeholders left):

- **Launch:** the exact command that starts the app for verification on a given port, and how to tell it's ready (a route that answers, a log line). Launch must reach a usable state from an empty database, including migrations and seed data. Ready means usable, not just that a process answers. A database health check can pass while its init scripts are still running. Include teardown.
- **Auth fixture:** how a run signs in as a known seeded user without a human: a seeded account and a login step that saves a session (a Playwright `storageState` file, a cookie jar for `curl`). Never use a real person's account.
- **Doctor:** one read-only check that answers "is this instance worth driving?": process up, right build, port owned by us, seed present, auth valid. An agent runs this first whenever anything looks off.
- **Drive:** the harness recipe with real routes, selectors, and requests from this repo, not examples. Prefer stable handles (ARIA roles and accessible names, `data-testid`, route paths) over CSS chains, coordinates, and tab order.
- **Evidence:** what to capture for a proof and where it goes. Default to `.astack/evidence/<branch>/`, the folder **verify-web** uses. State the proof standards: exercise the real user path, not internal setters or test-only endpoints; capture the action and the resulting state, not just the final screen; verify side effects (rows inserted, emails queued, files uploaded) alongside what's visible; mocks only where a production boundary already isolates the external system. When the safe path is a dry-run or test mode, verify what it actually skips by observing (network calls, rows, outbound mail) rather than trusting its name.
- **Cleanup:** how to tear down instances and seed data the run created. Never kill by process name; kill what you started. Cleanup removes instances and scratch state, never the evidence: proof artifacts survive the teardown, in a location the skill names.
- **Helpers:** any script the skill ships is executable and its invocation is shown in the skill body. A helper the reader has to reverse-engineer is not a helper.

## 3. Seed the feature map

Create `.claude/skills/verify-<app>/features/README.md` plus one file per user-facing feature you can identify (aim for the top 3-5 to start, from routes, API handlers, navigation, or docs). Follow the shape in [`references/feature-map-example/`](references/feature-map-example/), with a README index and one file per feature. Each file answers, from the user's point of view: what the feature is, how to reach it, how to drive it with the harness, and what observable end state proves it works. The four H2s are `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`. If the seed data lacks a precondition that a journey needs, the journey reports a failure and the reason goes in that feature's `Gotchas`. Never weaken the journey to make it pass. The map is the repo's maintained verification source; a proof that drives one convenient entry point is incomplete when the map lists others.

## 4. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, sign in, doctor, drive ONE mapped feature (one is enough; the map exists so later runs can cover the rest), capture evidence, clean up. After cleanup, confirm the evidence still exists at the named location. A cleanup that eats the proof fails this step. Fix what fails, and run the generated cleanup after every failed iteration too, so broken attempts don't strand processes and ports. A generated skill that was never executed is a draft, not a deliverable. If you proved it in a stand-in for the real target (a local database in place of a staging one, a mocked mail server in place of a real one), list every setup step the stand-in did that the target will not. Those steps stay unverified until a run on the real target covers them.

## 5. Offer the maintenance loop

Point the user at `/astack:maintain-verification-skill` for keeping the map honest as the app changes. Suggest a cadence only if they ask.
