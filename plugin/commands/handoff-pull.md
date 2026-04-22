---
description: Apply another device's Claude Code setup to this machine
argument-hint: "(no arguments — the slash command drives device picking and confirmation interactively)"
allowed-tools: [Bash, Read, AskUserQuestion]
---

Drive the pull flow yourself. The CLI has two interactive prompts (multi-device picker, `--confirm` y/N) that hang through Claude's Bash tool, so Claude must read the manifest, pick the source device, and surface the diff via `--dry-run` before invoking the real pull. Always pass `--from <device>` so the CLI never falls into TTY mode.

If the user already supplied `$ARGUMENTS`, just run `handoff pull $ARGUMENTS` and skip the interactive flow.

### 1. Read the hub manifest and current device

```bash
cat ~/.claude-handoff/hub/manifest.json
cat ~/.claude-handoff/config.json
```

Parse `devices` from the manifest — each entry has `latest.pushedAt`, `latest.fileCount`, and `latest.host`. Sort entries by `pushedAt` descending. Read `device` from the config — that's the current machine's name.

Decide the next step based on device count:

- **0 devices** → tell the user no machine has pushed yet, suggest `/handoff-push` on another device first, and stop.
- **1 device** → auto-pick it (warn the user if it's the same as the current device — pulling your own snapshot only makes sense when restoring).
- **N devices** → continue to step 2.

### 2. Pick the source device

Use `AskUserQuestion`:

- Question: `"Pull from which device?"`
- Options: one per known device, formatted as `"<name> — <fileCount> files, <relative-time>"`. Mark the current device with ` (this device)` suffix. Sort newest-first.
- Recommend the most-recent **non-self** device first (`(Recommended)` suffix).

The selected name becomes `--from <device>`.

### 3. Preview with --dry-run

Run:

```bash
handoff pull --from <device> --dry-run
```

The CLI prints `Applying N files from "<device>" → <claude-dir>` followed by every file path prefixed with `[dry]`, then `(dry-run — no files written)`. Surface that list so the user knows exactly what will change. If the file list is empty, stop and tell the user there's nothing to apply.

For richer diff context (modifications vs creations vs local-only files) add a follow-up:

```bash
handoff diff --from <device>
```

Run it only if the file list is large (>20) or the user asked for a deeper preview — `handoff diff` is read-only and never prompts.

### 4. Confirm before applying

Use `AskUserQuestion`:

- Question: `"Apply <N> files from <device> into <claude-dir>?"` — substitute real values.
- Options:
  - `Apply now (Recommended)` — proceed to step 5.
  - `Show full diff first` — run `handoff diff --from <device> --patch`, surface it, then re-ask this same question.
  - `Cancel` — stop without writing anything.

### 5. Run the real pull

```bash
handoff pull --from <device>
```

Do **not** pass `--confirm` — the user already confirmed in step 4, and `--confirm` would re-trigger the CLI's TTY prompt. Surface the CLI's output (`✓ pulled "<device>" into <claude-dir>`).

### 6. Report back

Summarize in 2–3 lines:

- Source device name and its `latest.pushedAt` timestamp from the manifest.
- File count applied.
- Note: files outside the configured scope on this machine are untouched, and the pull does NOT delete files that are missing from the snapshot.

If the user picked **Cancel** in step 4, make it explicit that nothing was applied.

### Fallbacks

- If `~/.claude-handoff/config.json` is missing, tell the user to run `/handoff-init` first and stop.
- If `~/.claude-handoff/hub/manifest.json` is missing, the hub clone is incomplete — suggest `/handoff-init` (which will re-clone) or a manual `git -C ~/.claude-handoff/hub pull`.
- If the CLI errors with `No snapshot directory at ...`, the chosen device's snapshot was never committed — surface the error and offer to re-run `/handoff-pull` against a different device.
- Never call `handoff pull` *without* `--from <device>` when more than one device exists. The CLI's interactive picker hangs through the Bash tool.
