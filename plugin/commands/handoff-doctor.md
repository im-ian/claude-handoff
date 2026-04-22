---
description: Diagnose missing external dependencies referenced by hooks
argument-hint: "[--verbose] [--fix]"
---

Use the Bash tool to run:

```bash
handoff doctor $ARGUMENTS
```

Doctor is read-only and never prompts. Surface the output verbatim.

Then summarize for the user:

- **Exit 0** ("All dependencies satisfied") → confirm everything is OK in one line.
- **Exit 1** (one or more missing) → list each missing binary with the file/line where it's used, and whether the manifest knows how to fix it:
  - **Declared with install command** → suggest `/handoff-bootstrap` (or `handoff bootstrap`) as the next step.
  - **Declared but no install command for current platform** → suggest `/handoff-deps add <name> --<platform> "..."` to add it.
  - **Not declared** → suggest `/handoff-deps add <name> --darwin "..." --linux "..."` to register it.

If the user passed `--fix`, the CLI runs `bootstrap` automatically after diagnosis (which itself prompts before installing).

### Fallbacks

- If `~/.claude-handoff/config.json` is missing, tell the user to run `/handoff-init` first.
- If hooks.json doesn't exist (`No external dependencies referenced...` output), confirm there's nothing to check and stop.
