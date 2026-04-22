# claude-handoff

Hand off your Claude Code setup between devices — like Apple Handoff, but for `~/.claude/`.

> Keep your plugins, hooks, agents, skills, and settings consistent across every machine you work from.

## Why

If you use Claude Code on multiple devices (laptop, desktop, work machine), you've probably felt the pain:

- Install a useful hook on one machine → forget to mirror it elsewhere
- Tweak an agent prompt → drift between devices within a week
- Onboard a new machine → spend an hour re-building your setup from scratch

`claude-handoff` treats your Claude Code configuration as a first-class, device-aware, syncable asset.

## What it syncs

Selective by default — you opt in to what travels:

| Scope | Default | Notes |
|-------|---------|-------|
| `settings.json` | ✅ | merged, device-specific overrides preserved |
| `hooks/` | ✅ | shell scripts and JSON definitions |
| `agents/` | ✅ | custom sub-agent definitions |
| `commands/` | ✅ | slash commands |
| `skills/` | ✅ | skill packages |
| `rules/` | ✅ | coding/style rules |
| `plugins/` | ⚠️ opt-in | some plugins are machine-specific |
| `projects/*/memory/` | ❌ | per-project memory stays local |
| Secrets (API keys, tokens) | ❌ | never synced |

## How it works

1. **Hub repo** — a GitHub repository acts as the source of truth.
2. **Device identity** — each machine registers under a device name (e.g. `macbook-pro`, `desktop-studio`).
3. **Push / Pull** — `handoff push` captures your local state; `handoff pull` applies it elsewhere.
4. **Conflict resolution** — 3-way merge with device-aware defaults; interactive prompts when ambiguous.

## Status

🚧 **Pre-alpha.** Design and prototype in progress.

## Roadmap

- [ ] CLI skeleton (`handoff init`, `push`, `pull`, `status`, `diff`)
- [ ] Sync manifest spec (what to include/exclude per device)
- [ ] Secret scrubbing (strip API keys before push)
- [ ] Conflict resolution UX
- [ ] Claude Code plugin wrapper (slash commands: `/handoff-push`, `/handoff-pull`)
- [ ] Watch mode (auto-push on change)
- [ ] Team/shared profiles (opt-in)

## Prior art

- [`claude-teleport`](https://github.com/anthropics/claude-code-plugins) — one-shot "beam my setup" flow
- Dotfile managers: `chezmoi`, `yadm`, `stow`

`claude-handoff` focuses specifically on Claude Code's configuration surface, with awareness of which pieces are machine-specific vs portable.

## License

MIT (pending)
