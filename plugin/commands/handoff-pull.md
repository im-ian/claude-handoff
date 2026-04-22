---
description: Apply another device's Claude Code setup to this machine
argument-hint: [--from <device>] [--confirm] [--dry-run]
---

Use the Bash tool to run:

```bash
handoff pull $ARGUMENTS
```

Notes:

- Default target is this device (re-sync with last push from here). Use `--from <other-device>` to adopt another machine's snapshot.
- `--confirm` shows a diff preview and asks y/N before overwriting — recommended the first time pulling from an unfamiliar device.
- `--dry-run` lists files that would be written without touching anything on disk.
- Pull does NOT delete local files that are missing from the snapshot; those stay.

Summarize: source device, file count applied, and any messages about scope boundaries. If the user used `--dry-run`, make it explicit that nothing was applied.
