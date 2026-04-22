---
description: Register this machine with claude-handoff and link (or create) a hub repository
argument-hint: "(no arguments — the slash command collects answers interactively)"
allowed-tools: [Bash, Read, AskUserQuestion]
---

Drive the setup flow yourself using `AskUserQuestion` to collect answers, then call the `handoff init` CLI with the right flags. The CLI itself is not meant to be prompted through Claude's Bash tool — instead, Claude is the interactive layer. Always pass every user-facing answer as a flag so `prompts` never fires.

If the user already supplied `$ARGUMENTS`, just run `handoff init $ARGUMENTS` and skip the interactive flow.

### 1. Check the current state

Run, without arguments:

```bash
test -f ~/.claude-handoff/config.json && cat ~/.claude-handoff/config.json || echo 'NO_CONFIG'
```

- `NO_CONFIG` → this is a **fresh install**.
- JSON output → this is an **update**; remember `device` and `hubRemote` as current values.

Also run `hostname | sed 's/\..*//' | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-'` and keep the first token — that becomes the default device name on fresh install.

### 2. Ask about the hub (fresh install only)

Use `AskUserQuestion` with one question:

- Question: "How should this machine's hub repo be set up?"
- Options:
  - `Create a new private GitHub repo` — we'll call `gh repo create` via `--create-hub`
  - `Use an existing repo I already have` — you'll provide its URL
  - `Skip hub clone for now` — write config only (`--skip-clone`)

Then depending on the choice:

- **Create**: ask for the repo name (default suggestion: `claude-handoff-hub`). Validate it matches `^[A-Za-z0-9._-]{1,100}$`. This becomes `--create-hub <name>`.
- **Existing**: ask for the full clone URL (e.g. `git@github.com:you/my-hub.git` or `https://github.com/you/my-hub.git`). Must be non-empty. This becomes `--hub <url>`.
- **Skip**: you'll still need a URL to store in config. Ask for it (or let the user paste a placeholder they'll fix later). This becomes `--hub <url> --skip-clone`.

### 3. Ask about the device name

Use `AskUserQuestion`:

- Question: "Device name for this machine?"
- Offer the default (current value on update, hostname-derived on fresh install) as one option, plus an option to enter a custom name.
- Validate: `^[a-z0-9][a-z0-9-]{0,39}$` (lowercase letters/digits/hyphens, starts with letter or digit). If invalid, re-ask with the rule in the prompt.

Pass as `--device <name>`.

### 4. Update flow extras

If this is an update (config exists):

- Show the current `device` and `hubRemote` to the user first.
- Ask whether they want to **keep each** or change it (two `AskUserQuestion` turns, or a single multi-select listing "Change device name" / "Change hub URL" — whichever is cleaner).
- Only pass flags for fields they chose to change. Unchanged fields are omitted so the existing value is preserved.
- If they want a full reset (scope, secretPolicy, substitutions back to defaults), ask once "Also reset scope/secretPolicy/substitutions?" — if yes, append `--force`.

### 5. Run the CLI

Assemble the command. Examples:

```bash
handoff init --create-hub claude-handoff-hub --device macbook
handoff init --hub git@github.com:you/my-hub.git --device laptop
handoff init --hub https://github.com/you/my-hub.git --device laptop --skip-clone
handoff init --device macbook-pro --force   # update, rename device, reset editables
```

Run it via Bash. Surface the CLI's stdout/stderr to the user as-is (it already prints `✓`/`⚠` lines with colors).

### 6. Report back

On success, summarize in one short paragraph:

- Whether this was a fresh install or an update.
- The device name.
- The hub URL (and note if it was just created via `gh`).
- Suggest `/handoff-push` as the next step.

If the CLI exited non-zero, tell the user what failed (hub URL invalid, `gh` not authenticated, device name invalid, etc.) and offer to re-run `/handoff-init` to fix it.

### Fallbacks

- If `handoff` is not on PATH, tell the user to install claude-handoff — see https://github.com/im-ian/claude-handoff — and stop.
- If `gh` is needed (for `--create-hub`) but missing or unauthenticated, the CLI will error with a clear message; forward that message and suggest `brew install gh` / `gh auth login` accordingly.
- Never call `handoff init` without `--device` AND one of (`--hub` or `--create-hub`) on a fresh install. Missing flags would trigger the CLI's TTY prompts, which hang through the Bash tool.
