---
description: Register this machine with claude-handoff and link (or create) a hub repository
argument-hint: [--hub <url> | --create-hub <name>] [--device <name>] [--force] [--skip-clone]
---

Use the Bash tool to run:

```bash
handoff init $ARGUMENTS
```

### Flag guidance for the agent

- `--hub <url>` points at an **existing** hub repo. The URL must already resolve on GitHub/GitLab/etc.
- `--create-hub <name>` creates a **new** private GitHub repo with that name via `gh repo create --private` and uses it as the hub. The two flags are mutually exclusive — pick one.
- `--device <name>` sets the local device identifier. Skip to accept the default (hostname on fresh install, current value on update).
- `--force` only matters on an update: it resets scope, secretPolicy, and substitutions back to defaults alongside updating the primary fields.
- `--skip-clone` writes config without cloning the hub — handy when the hub URL isn't reachable yet.

### Non-TTY caveat

Claude Code's Bash tool is not a TTY, so `handoff init` cannot prompt interactively through this slash command. If the user invokes `/handoff-init` with no arguments on a fresh install, the CLI will hang waiting for prompts. In that case, inform them to either:

- run `handoff init` directly in their terminal (for full interactive flow), or
- re-invoke with `--create-hub <name> --device <name>` (one-shot creation), or
- re-invoke with `--hub <url> --device <name>` (pointing at a hub they already created)

### On success

Summarize: device name registered, hub repo linked (note if it was just created), and suggest `/handoff-push` as the next step.

If `handoff` is not on PATH, tell the user to install claude-handoff — see https://github.com/im-ian/claude-handoff.
