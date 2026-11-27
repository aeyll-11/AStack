# Install and set up

## Install

```
/plugin marketplace add <path or repo>
/plugin install astack@astack
```

Check it with `claude plugin validate` from the plugin folder.

## Set up

Run `/astack:setup-astack` in an interactive session. It does not run headless. It asks, in order:

1. **Packs.** Shows what `scripts/detect.ts` found. No answer needed.
2. **Models and effort.** You pick a model family (`opus`, `sonnet`, `haiku`, `fable`) for each of the 11 roles, or accept the suggested set. Effort is `low`, `medium`, `high`, `xhigh`, or `max`.
3. **Issue source.** GitHub or Linear, plus labels, assignee, milestone, and the Linear team key. Written to `.astack/config.json`. Phoebe needs this.
4. **Notifications.** Reviewer login and push on or off.
5. **Dev server.** Command and base port, for example `npm run dev` and `3000`.
6. **Router hook.** On or off.
7. **Permissions.** Writes `permissions.allow` and `permissions.deny` to `.claude/settings.json` after showing you the diff. It offers narrower entries than the broad defaults. It always denies PR merge and force-push.
8. **Competing plugins.** Lists workflow plugins and the `claude plugin disable <name>` command for each. It never runs the command.

## Change a setting later

Re-run `/astack:setup-astack`. Each question shows the current value. Or use the CLI:

```
node <plugin root>/scripts/config.ts set concurrency 3
node <plugin root>/scripts/config.ts set models.verify '{"model":"sonnet","effort":"low"}'
node <plugin root>/scripts/config.ts path --project
```

User file: `~/.claude/astack/config.json`. Project file: `.astack/config.json`.
