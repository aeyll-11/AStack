---
name: commit
description: "Make commits authored by the current git user, with no AI attribution. Use for every commit Resonator makes."
---

# Commit

Every commit carries the current git user as its only author. A `PreToolUse` hook, `scripts/commit-guard.ts`, denies a `git commit` that breaks the rules below. If it denies, fix the message and retry.

## Identity

- Author and committer are the current git identity: `git config user.name` and `git config user.email`.
- The author name is the user's GitHub login, so commits are easy to track. Before the first commit in a repo, compare `git config user.name` with `gh api user --jq .login`. If they differ, tell the user and offer `git config user.name <login>`, set for this repo only and never with `--global`. The email stays whatever the user already has.
- If either is unset, stop and ask the user to set it. Never invent one.
- Never pass `--author` with any value other than that identity.

## Attribution

- Never add a `Co-Authored-By:` line naming Claude, Anthropic, or any AI model.
- Never add "Generated with Claude Code" or a similar line.
- Human co-authors the user names explicitly are allowed.

## Message

- Conventional Commits: `type(scope): subject`. The subject is imperative and at most 72 characters.
- Add a body only when the why is not obvious.
- For a multi-line message, write it to a file and run `git commit -F <file>`.

## Units

- Commit small, ordered units, each green on its own.
- Never use `--no-verify`.
