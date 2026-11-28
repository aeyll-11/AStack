# Principles

Resonator has 24 principles. Each is a skill named `principle-<title>`. The router reads the full skill before it applies one, and says in its reply which principle changed which decision.

## Core

- **laziness-protocol.** Sizing a diff. Prefer deletion and the smallest change that works.
- **foundational-thinking.** Types and data structures before logic.
- **redesign-from-first-principles.** A new requirement meets an old design.
- **attack-the-premise.** Two fixes sharing a premise both failed. Test the premise.
- **subtract-before-you-add.** Remove dead weight first.
- **minimize-reader-load.** Count layers and hidden state.
- **outcome-oriented-execution.** Converge on the target. Skip throwaway compatibility states.
- **experience-first.** Choose user delight over implementation convenience.
- **exhaust-the-design-space.** Prototype two or three options for a novel decision.
- **build-the-lever.** Build the codemod or script a reviewer can rerun.

## Architecture

- **model-the-domain.** Encode stateful logic in a structure.
- **boundary-discipline.** Guard at boundaries, keep business logic pure.
- **type-system-discipline.** Make illegal states unrepresentable.
- **make-operations-idempotent.** Commands that survive crashes and retries.
- **migrate-callers-then-delete-legacy-apis.** Migrate and delete in one wave.
- **separate-before-serializing-shared-state.** Remove the sharing before locking it.

## Verification

- **prove-it-works.** Verify against the real app.
- **fix-root-causes.** Fix the first place the system went wrong.
- **sequence-verifiable-units.** Each unit ends in a check.
- **test-behavior-not-implementation.** Assert what users of the code observe.
- **explain-the-number.** Find what limits a measurement.

## Delegation

- **guard-the-context-window.** Route bulk to subagents, keep summaries.
- **never-block-on-the-human.** Proceed on reversible work and show the result.

## Meta

- **encode-lessons-in-structure.** Turn a repeated instruction into a lint, check, or script.
