#!/usr/bin/env bash
# Install claude-handoff slash commands into ~/.claude/commands/ via symlinks.
# Symlinks mean updates to this repo automatically reach your Claude Code session.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${CLAUDE_HOME:-$HOME/.claude}"
TARGET_DIR="$TARGET_ROOT/commands"

if [ ! -d "$TARGET_ROOT" ]; then
  echo "error: $TARGET_ROOT does not exist — is Claude Code installed?" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

shopt -s nullglob
installed=0
for cmd in "$PLUGIN_DIR/commands/"*.md; do
  name="$(basename "$cmd")"
  target="$TARGET_DIR/$name"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "skip (non-symlink already exists): $target" >&2
    continue
  fi
  ln -sf "$cmd" "$target"
  echo "linked: /${name%.md}"
  installed=$((installed + 1))
done

if ! command -v handoff >/dev/null 2>&1; then
  echo ""
  echo "⚠ \`handoff\` is not on your PATH. The slash commands will fail until the CLI is installed."
  echo "  For local development: from the repo root, run \`pnpm link --global\`."
  echo "  Once published:        npm install -g claude-handoff"
fi

echo ""
echo "Installed $installed command(s). Try /handoff-status in Claude Code."
