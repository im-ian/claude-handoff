---
description: Register this machine with claude-handoff and link a hub repository
argument-hint: [--hub <url>] [--device <name>] [--force]
---

Use the Bash tool to run:

```bash
handoff init $ARGUMENTS
```

If the command is interactive and prompts for missing values (hub URL, device name), inform the user that `/handoff-init` cannot stream those prompts through Claude Code — ask them to run `handoff init` directly in their terminal, or re-invoke with `--hub` and `--device` flags.

On success, summarize: which device name was registered, which hub repo is linked, and suggest `/handoff-push` as the next step.

If `handoff` is not on PATH, tell the user to install claude-handoff (see https://github.com/im-ian/claude-handoff).
