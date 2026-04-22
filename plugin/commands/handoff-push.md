---
description: Push this machine's Claude Code setup to the hub
argument-hint: "(no arguments — the slash command drives secret-scan decisions interactively)"
allowed-tools: [Bash, Read, AskUserQuestion]
---

Drive the push flow yourself. The CLI's per-file secret-review prompt is interactive (powered by `prompts`) and hangs through Claude's Bash tool, so Claude must inspect the scan via `--dry-run` and pass an explicit policy flag (`--skip-on-secrets`, `--allow-secrets`, or no flag = no findings) before invoking the real push. Always assemble the final command yourself so the CLI never falls into TTY mode.

If the user already supplied `$ARGUMENTS`, just run `handoff push $ARGUMENTS` and skip the interactive flow.

### 1. Preflight with --dry-run

Run, without prompts:

```bash
handoff push --dry-run
```

Surface the output to the user verbatim. Then parse it for three things:

- **Scope count** — line `Scope matched N file(s):`. If `N == 0`, stop and tell the user nothing matches the include rules.
- **Findings count** — line `⚠  N potential secret finding(s) across your snapshot.` If absent, treat as `0`.
- **Hub visibility** — one of:
  - `Hub appears private (GitHub isPrivate=true).` → `private`
  - `Hub is PUBLIC (...)` → `public`
  - `Hub visibility UNKNOWN ...` → `unknown`

### 2. Decide on the secret-scan policy

If `findings == 0`, skip to step 4 and run `handoff push` with no scan flag.

If `findings > 0`, use `AskUserQuestion`:

- Question: `"<N> potential secret finding(s) detected. How should I handle them?"` (substitute the real count).
  - When visibility is `public` or `unknown`, prepend a warning: `"⚠ Hub is <PUBLIC|UNKNOWN> — anything uploaded would be visible to everyone with hub access. "`
- Options:
  - `Skip flagged files (Recommended)` — flagged files won't sync, everything else uploads. Maps to `--skip-on-secrets`.
  - `Upload everything (bypass scan)` — uploads even files containing potential credentials. Maps to `--allow-secrets`. Recommend this only when the user has reviewed the findings list and the hub is `private`.
  - `Abort the push` — stop here so the user can clean the secrets out of their `~/.claude/` first.

If the user picks **abort**, stop. If they pick **skip flagged**, remember `--skip-on-secrets`. If they pick **upload everything**, remember `--allow-secrets`.

When visibility is `unknown` or `public`, default-recommend `Skip flagged files` instead of `Upload everything`, regardless of order.

### 3. Optional: custom commit message

Skip this step by default — the CLI's auto-message (`push: <device> — N files`) is fine. Only ask if the user explicitly asked for a custom message in `$ARGUMENTS` or in the conversation. If so, validate non-empty and pass `-m "<message>"`.

### 4. Run the real push

Assemble exactly one of:

```bash
handoff push                              # findings == 0
handoff push --skip-on-secrets            # findings present, user chose skip
handoff push --allow-secrets              # findings present, user chose allow
handoff push --skip-on-secrets -m "msg"   # add -m only when explicitly requested
```

Run it via Bash. Because every prompt branch was suppressed by an explicit flag, the CLI never hits `prompts` — output streams straight through.

### 5. Report back

On success the CLI ends with `✓ pushed N files as <device>@<sha>`. Summarize in 2–3 lines:

- File count pushed.
- How many files were skipped by secret review (if any), with their paths.
- Short SHA + the hub URL.
- If this is the first push from this machine, suggest `/handoff-pull --from <this-device>` on another machine as the next step.

If the CLI exited non-zero, surface its stderr and offer to re-run `/handoff-push`.

### Fallbacks

- If `~/.claude-handoff/config.json` is missing, tell the user to run `/handoff-init` first and stop.
- If Claude Code's safety hook denies `handoff push --allow-secrets` even after the user explicitly chose it (the user authorization is captured in the conversation), surface the hook's message and tell the user they can either (a) re-run `handoff push --allow-secrets` directly in their terminal, or (b) add a Bash permission rule to their Claude settings to allow it.
- Never call `handoff push` *without* `--skip-on-secrets` or `--allow-secrets` when findings exist. Doing so triggers the CLI's per-file `prompts`, which hang through the Bash tool.
