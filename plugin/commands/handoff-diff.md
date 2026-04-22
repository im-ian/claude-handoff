---
description: Preview what would change when pulling from a device
argument-hint: [--from <device>] [-p | --patch] [--files-only]
---

Use the Bash tool to run:

```bash
handoff diff $ARGUMENTS
```

Interpretation of the output markers:

- `+` file will be created by pull
- `M` text file will be overwritten (with line counts `(+X -Y)`)
- `B` binary file will be overwritten
- `L` file exists only locally; pull will NOT remove it (important: no silent deletions)

Default (no `--from`) compares local against this device's own last push — useful as a pre-push sanity check. Use `-p` to include full unified patches for each modified file.

Summarize for the user: source device, count by category, and flag any `L` entries since those imply the remote device deleted something this device still has.
