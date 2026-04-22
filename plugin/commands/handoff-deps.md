---
description: Manage this device's declared external dependencies
argument-hint: "<add|list|remove> [args]"
---

Use the Bash tool to run:

```bash
handoff deps $ARGUMENTS
```

Subcommands:

- `handoff deps list` — show all declared dependencies for this device.
- `handoff deps add <name> --darwin "<cmd>" --linux "<cmd>" [--description "<text>"]` — declare or update a dependency. At least one of `--darwin` / `--linux` is required.
- `handoff deps remove <name>` (alias: `rm`) — remove a declared dependency.

`add` and `remove` automatically commit + push the manifest change to the hub.

Surface CLI output verbatim. Errors (missing name, no platform commands, not initialized) come from the CLI with clear messages — relay them.

### Common follow-ups

- After `add` → suggest `/handoff-doctor` to verify the binary is now declared, or `/handoff-bootstrap` to install it on the current machine.
- After `remove` → no follow-up required; the next push from any device will reflect the removal.

### Fallbacks

- If `$ARGUMENTS` is empty, run `handoff deps --help` and surface its output instead.
- If `~/.claude-handoff/config.json` is missing, suggest `/handoff-init` first.
