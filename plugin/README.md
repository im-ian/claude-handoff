# claude-handoff — Claude Code slash command plugin

Thin wrapper that exposes the `handoff` CLI as Claude Code slash commands.

## Commands

| Slash command | CLI equivalent |
|---------------|----------------|
| `/handoff-init` | `handoff init` |
| `/handoff-push` | `handoff push` |
| `/handoff-pull` | `handoff pull` |
| `/handoff-diff` | `handoff diff` |
| `/handoff-status` | `handoff status` |

Arguments are passed through via `$ARGUMENTS`, so `/handoff-pull --from work-pc --confirm` works exactly as expected.

## Install

### Requirements

- `handoff` CLI on your PATH. Install via `pnpm link --global` from the repo root, or (once published) `npm install -g claude-handoff`.
- Claude Code with `~/.claude/commands/` writable (the usual default).

### One-liner

From the repo root:

```bash
plugin/install.sh
```

This symlinks every `plugin/commands/*.md` into `~/.claude/commands/`. Symlinks (not copies) so that `git pull` on this repo automatically picks up new/updated commands.

### Custom Claude home

If your Claude Code data lives elsewhere:

```bash
CLAUDE_HOME=/path/to/claude-home plugin/install.sh
```

### Manual

Symlink (or copy) individual command files into `~/.claude/commands/`:

```bash
ln -s "$(pwd)/plugin/commands/handoff-push.md" ~/.claude/commands/
```

## Interactive prompts caveat

Some `handoff` subcommands are interactive:

- `handoff init` asks for the hub URL and device name (skip by passing `--hub` and `--device`)
- `handoff push` prompts per file when the secret scanner finds something, and asks to type `yes` for public hubs (skip with `--skip-on-secrets` or `--allow-secrets`)
- `handoff pull --confirm` asks y/N before applying

Claude Code's Bash tool is not a TTY, so these prompts will either fail or force-abort. When that happens, either:
- run the command directly in your terminal, or
- pass the corresponding non-interactive flag (`--skip-on-secrets` is the safe default for scripted pushes).

## Uninstall

```bash
rm ~/.claude/commands/handoff-*.md
```

(Safe because they're symlinks — the source files in this repo are untouched.)
