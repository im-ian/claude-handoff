---
description: Install declared external dependencies that are missing on this machine
argument-hint: "(no arguments — the slash command drives the install confirmation interactively)"
allowed-tools: [Bash, AskUserQuestion]
---

Drive the bootstrap flow yourself. The CLI's confirmation is interactive (`prompts` confirm) and hangs through Claude's Bash tool, so always pre-show the install plan via `--dry-run`, then use `AskUserQuestion` to confirm before invoking with `--yes`.

If `$ARGUMENTS` is provided, just run `handoff bootstrap $ARGUMENTS` and skip the interactive flow.

### 1. Show install plan via --dry-run

Run:

```bash
handoff bootstrap --dry-run
```

If the output says "No declared dependencies" or "All declared dependencies are already installed" → surface and stop. There's nothing to install.

Otherwise the CLI prints `Install plan (N missing):` followed by `<binary>  <install command>` lines. Surface that list verbatim.

### 2. Confirm with AskUserQuestion

- Question: `"Run all <N> install commands? They execute with shell access on this machine."` (substitute the real count)
- Options:
  - `Yes, install all` — proceed to step 3.
  - `Cancel` — stop without executing.

Only proceed if the install commands shown are trusted — they came from the device's `dependencies.json` in the hub, which was edited by whoever ran `handoff deps add` from another device.

### 3. Execute

```bash
handoff bootstrap --yes
```

Surface output. The CLI runs each install in sequence (`stdio: 'inherit'`), then re-verifies with `command -v` and reports per-binary success/failure.

### 4. Report

Summarize the final tally (`X succeeded, Y failed`). For any failures, surface the install command and suggest re-running it manually in the user's terminal — usually a permissions, network, or wrong-package-manager issue that the slash command can't auto-resolve.

### Fallbacks

- If `~/.claude-handoff/config.json` is missing → `/handoff-init` first.
- If no manifest exists for this device → suggest `/handoff-deps add <name> --darwin "..." --linux "..."` to declare deps first.
- If a Claude Code safety hook denies the install command (e.g. `sudo apt install`) → surface the hook message and tell the user to run `handoff bootstrap --yes` directly in their terminal.
