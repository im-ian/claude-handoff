---
description: Push this machine's Claude Code setup to the hub
argument-hint: [--allow-secrets | --skip-on-secrets] [-m <commit-msg>]
---

Use the Bash tool to run:

```bash
handoff push $ARGUMENTS
```

Important behavior to watch for in the output:

- The scanner may detect secrets and prompt per file. Those prompts are interactive — if the command appears to hang waiting for input, tell the user to run `handoff push` directly in their terminal. For non-interactive flows in Claude Code, suggest `--skip-on-secrets` (auto-skip flagged files) or `--allow-secrets` (bypass scan entirely; only when the user has reviewed and is sure).
- If hub visibility is `public` or `unknown`, the scanner demands an extra typed `yes` before uploading any file with findings.
- On success the output ends with `✓ pushed N files as <device>@<sha>`.

Summarize: how many files were pushed, whether any were skipped by secret review, and the resulting short SHA.
