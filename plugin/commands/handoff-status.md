---
description: Show claude-handoff sync state and all known devices
---

Use the Bash tool to run:

```bash
handoff status
```

Summarize:

- which device this machine is registered as
- the hub repo URL
- each known device with its last-push timestamp and file count
- which device is the current one (marked with `●`)

If the output says "Not initialized", suggest `/handoff-init` to the user.
