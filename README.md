<div align="right">

**English** | [한국어](README.ko.md)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
  <img src="docs/assets/hero-light.svg" alt="claude-handoff" width="100%">
</picture>

<p align="center">
  Hand off your Claude Code setup between devices — sync <code>~/.claude/</code> across machines, driven by slash commands.
</p>

---

## Why

Use Claude Code on multiple machines and you eventually copy `hooks.json` from your home Mac to your work Mac, only to watch every hook fail because `/Users/your-home-name/` doesn't exist under `/Users/your-work-name/`. `claude-handoff` tokenizes machine-specific paths so hooks Just Work, scans for secrets before anything leaves your machine, and supports N devices × M versions through a shared hub repository.

Everything happens inside Claude Code via slash commands — no flag-chasing, no TTY hangs, no terminal gymnastics.

---

## Quick start

Inside Claude Code:

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
/reload-plugins
```

One-time terminal step (npm publish pending — see [Installation](#installation)):

```bash
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link
```

Then back in Claude Code:

```
/handoff-init       # asks you a few questions, creates a PRIVATE GitHub hub repo
/handoff-push       # snapshot ~/.claude/ to the hub
```

On another machine — after the same install + `/handoff-init`:

```
/handoff-pull       # pick the source device, preview diff, apply
```

Every slash command drives prompts through `AskUserQuestion` (device pickers, secret-scan policy, install confirmations) — no interactive CLI hangs, no flags to memorize.

---

## Installation

### 1. Plugin (inside Claude Code)

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
/reload-plugins
```

Updates ride through `/plugin update`.

### 2. `handoff` CLI backend

The plugin is a thin wrapper — every slash command shells out to a `handoff` binary on your PATH. Until npm publish lands, install from source:

```bash
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link
```

Verify with `/handoff-status` inside Claude Code — if it runs without "command not found", you're set. In terminal, `handoff --version` prints `1.0.0`.

### Uninstall

```
/plugin uninstall claude-handoff@claude-handoff
```

```bash
npm unlink -g @im-ian/claude-handoff   # CLI
rm -rf ~/.claude-handoff               # local config + hub clone (remote untouched)
```

---

## Slash commands

| Command | Purpose |
|---|---|
| `/handoff-init` | Register this device, link or create a hub repo. Interactively picks hub setup and device name. |
| `/handoff-push` | Snapshot `~/.claude/` to the hub. Runs secret scan via `--dry-run` first; `AskUserQuestion` drives skip/allow/abort on findings. |
| `/handoff-pull` | Apply another device's snapshot. Shows the device list, previews the diff, asks before overwriting. |
| `/handoff-diff` | Preview what `pull` would change, without applying. |
| `/handoff-status` | Show this device's registration, hub URL, and all known devices with last-push timestamps. |
| `/handoff-doctor` | Diagnose missing external deps referenced by `hooks.json` — shows where each missing binary is used and how to install it. |
| `/handoff-bootstrap` | Install declared deps that are missing on this machine. Always shows the plan and asks before executing. |
| `/handoff-deps` | Manage the per-device `dependencies.json` (`add <name> --darwin "..." --linux "..."` / `list` / `remove`). |

---

## What gets synced

Conservative **allowlist** so unknown files never leak by accident.

- **Default include:** `agents/**`, `commands/**`, `hooks/**`, `skills/**`, `rules/**`, `scripts/**`, `mcp-configs/**`, `settings.json`, top-level `*.md`
- **Hard-deny (always excluded):** `projects/**`, `sessions/**`, `cache/**`, `telemetry/**`, `backups/**`, `*.log`, `*.jsonl`, `**/.credentials.json`, `**/.env*`, `**/*credentials*`, `**/*secret*`, `.DS_Store`
- **Custom:** edit `scope.include` / `scope.excludeExtra` in `~/.claude-handoff/config.json`. `excludeExtra` stacks on the hard-deny list.

---

## Tokenization

Hooks routinely embed absolute paths like `/Users/alice/.claude/hooks/format.sh`. Sync verbatim → username `bob` machine → every path breaks.

On push, two literals get rewritten to placeholders. On pull, they resolve back to the local machine's values:

| Token | Replaces |
|---|---|
| `${HANDOFF_CLAUDE}` | `$HOME/.claude` (absolute path) |
| `${HANDOFF_HOME}` | `$HOME` |

So `"command": "node \"/Users/alice/.claude/hooks/x.js\""` becomes `"node \"${HANDOFF_CLAUDE}/hooks/x.js\""` in the hub, then on bob's machine resolves to `"node \"/Users/bob/.claude/hooks/x.js\""` — automatically correct. Longest pattern wins so path nesting stays right.

`${HANDOFF_USER}` / `${HANDOFF_HOSTNAME}` exist but are **off by default** — bare usernames false-positive into prose (`alice` → `malice`/`palace`). Opt in via `substitutions: [{ "from": "alice", "to": "${HANDOFF_USER}" }]` in config when needed.

---

## Secret scanner

Every scoped text file (≤ 2 MB) is scanned for: Anthropic/OpenAI/GitHub/Google/AWS/Slack tokens, private key headers, JWTs, generic `password=` / `api_key=` literals.

- **From `/handoff-push`.** A `--dry-run` preflight surfaces findings, then `AskUserQuestion` offers skip flagged / upload everything / abort. Public or unknown-visibility hubs get an extra warning.
- **From the terminal, interactive.** Per-file prompt: *skip* / *upload anyway* / *abort*. Non-private hubs require a typed `yes` confirmation.
- **False positives** (Django `SECRET_KEY` examples, test fixtures, password-pattern docs) → add file paths to `secretPolicy.allow` in config. Manual edits only — prevents click-fatigue from silently growing the list.

---

## Dependency management

Hooks invoke external CLIs (`gh`, `jq`, `clawd`, `rtk`, …). After a pull onto a fresh machine, those binaries may not be installed → hooks silently fail with `command not found`. Three slash commands address this:

```
/handoff-deps add gh --darwin "brew install gh" --linux "apt install gh"
/handoff-doctor            # confirm gh is declared; see what else is missing
/handoff-bootstrap         # install missing declared deps (shows plan, asks first)
```

- **`/handoff-doctor`** — read-only scan of `hooks/hooks.json`. Shows missing binaries with file:line context and a suggested fix from the manifest.
- **`/handoff-deps add/list/remove`** — edits the per-device manifest at `<hub>/devices/<name>/dependencies.json`. `add` and `remove` auto-commit and push.
- **`/handoff-bootstrap`** — installs declared deps that aren't on PATH. Always prints the install plan first, always requires confirmation. Pull *never* auto-installs anything.

v1 detects from `hooks/hooks.json` only; `scripts/**/*.sh` parsing comes in v1.1.

---

## Hub layout

```
<hub>/
├── devices/<name>/
│   ├── snapshot/            # tokenized scoped files
│   ├── version.json         # timestamp, file count, byte count, host
│   └── dependencies.json    # declared external deps for this device
└── manifest.json            # registry of all devices
```

One git commit on the hub = one push from one device. **N devices × M versions** emerges naturally from git history. No cross-device merging — `/handoff-pull --from X` always applies X's complete snapshot atomically.

---

## Configuration

`~/.claude-handoff/config.json` — full schema in [`docs/DESIGN.md`](docs/DESIGN.md). Most users never touch this file; `/handoff-init` writes a sensible default.

```json
{
  "device": "my-mac",
  "hubRemote": "https://github.com/<you>/<hub>.git",
  "claudeDir": "/Users/<you>/.claude",
  "scope": { "include": ["agents/**", "..."], "optIn": [], "excludeExtra": [] },
  "secretPolicy": { "allow": [] },
  "substitutions": []
}
```

`CLAUDE_HANDOFF_HOME` env var overrides the config/hub location (default `~/.claude-handoff/`) — useful for safe trial runs (`CLAUDE_HANDOFF_HOME=/tmp/trial handoff init …`) and per-user isolation in shared environments.

---

## Terminal usage (optional)

Every slash command is a thin wrapper around a matching `handoff <subcommand>` in your shell. If you prefer the terminal, `handoff init`, `handoff push`, `handoff pull --from <device>`, `handoff doctor`, etc. all work identically — same flags, same output. `handoff <cmd> --help` for the full flag listing.

---

## Troubleshooting

- **`fatal: could not read Password for 'https://…@github.com'`** — set a local credential helper for the hub clone:
  ```bash
  git -C ~/.claude-handoff/hub config --local credential.helper '!gh auth git-credential'
  ```
  Multi-account: `gh auth switch --user <login>` first.

- **Hub visibility `UNKNOWN`** — non-GitHub host or `gh` missing/unauthenticated. Treated as potentially public; requires typed `yes` per file with findings.

- **Scope-change churn** — widening shows new files as `added`; narrowing leaves stale snapshot files (the hub doesn't auto-prune). Re-push from the owning device to rewrite its snapshot.

---

## Status

**v1.0.0** — stable. Used in production across multiple devices. npm publish pending.

**Roadmap:** `handoff log --device <name>`, `handoff pull --at <sha>`, auto credential-helper setup on `init`, `scripts/**/*.sh` parsing in `doctor`, SessionStart-hook integration (opt-in "soft handoff"), npm release.

---

## Prior art

- [`claude-teleport`](https://github.com/anthropics/claude-code-plugins) — one-shot beam, no per-device awareness.
- Dotfile managers (`chezmoi`, `yadm`, `stow`) — general-purpose, require manual templating for path differences.

`claude-handoff` is purpose-built for Claude Code: knows which pieces are machine-specific vs. portable, defaults that keep secrets out, and a slash-command UX that never drops you into an interactive terminal flow.

---

## License

MIT
