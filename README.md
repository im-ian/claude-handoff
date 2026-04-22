<div align="right">

**English** | [한국어](README.ko.md)

</div>

# claude-handoff

Hand off your Claude Code setup between devices — like Apple Handoff, but for `~/.claude/`.

> Keep your agents, commands, hooks, skills, and rules consistent across every machine you work from — without leaking machine-specific paths or secrets.

---

## Why

If you use Claude Code on multiple machines (laptop, desktop, work, server), you have probably hit one of these:

- Install a useful hook on one machine → forget to mirror it elsewhere.
- Tweak an agent prompt → the two devices drift apart within a week.
- Onboard a new machine → spend an hour rebuilding from scratch.
- Worst of all: copy `hooks.json` from your home Mac to your work Mac and watch every hook fail because `/Users/your-home-name/` doesn't exist under `/Users/your-work-name/`.

`claude-handoff` treats your Claude Code configuration as a first-class, device-aware, syncable asset. It tokenizes machine-specific paths so hooks Just Work on the other device, scans for secrets before anything leaves your machine, and supports N devices × M versions via a shared hub repository.

---

## Quick start

```bash
# 1. Install the slash-command plugin — inside Claude Code:
#    /plugin marketplace add im-ian/claude-handoff
#    /plugin install claude-handoff@claude-handoff

# 2. Install the CLI (from source — npm package coming later)
git clone https://github.com/im-ian/claude-handoff.git
cd claude-handoff
npm install && npm run build && npm link

# 3. Create a PRIVATE hub repo (GitHub example)
gh repo create my-claude-hub --private

# 4. Register this machine
handoff init --hub https://github.com/<you>/my-claude-hub.git --device my-macbook

# 5. Preview what would be pushed
handoff push --dry-run

# 6. Push for real
handoff push

# 7. On another machine, after installing plugin + CLI + `handoff init`:
handoff pull --from my-macbook --confirm
```

That's the whole loop. Everything below is detail.

---

## Installation

Two pieces to install:

1. **The Claude Code slash-command plugin** — exposes `/handoff-init`, `/handoff-push`, etc. inside Claude Code. *Most users start here.*
2. **The `handoff` CLI** — the actual tool that the slash commands call out to. **Required** for the plugin commands to do anything; without it, every slash command returns "command not found".

Install the plugin first (it's the user-facing entry point), then the CLI.

### 1. The slash-command plugin

Pick **one** of the two install paths. Don't mix them — you'll end up with duplicate commands loaded twice.

#### Option A — Claude Code marketplace ⭐ **recommended for most users**

The repo ships a marketplace manifest at `.claude-plugin/marketplace.json`. Inside Claude Code:

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
```

Why this path:

- Managed by Claude Code's built-in plugin manager. Updates ride through `/plugin update`.
- No need to clone this repo on your machine.
- Namespaced cleanly; uninstall with `/plugin uninstall`.

After install, open a new Claude Code session and confirm `/handoff-status` appears in autocomplete. Then proceed to step 2 to install the CLI.

#### Option B — Local symlinks (for contributors or latest-git tracking)

Pick this when you're actively editing the repo or want your `/handoff-*` commands to track unmerged changes.

```bash
git clone https://github.com/im-ian/claude-handoff.git
cd claude-handoff
plugin/install.sh
```

`plugin/install.sh` symlinks every `plugin/commands/*.md` into `~/.claude/commands/`. Five commands get installed:

```
linked: /handoff-init
linked: /handoff-push
linked: /handoff-pull
linked: /handoff-diff
linked: /handoff-status
```

Because they're symlinks, `git pull` on this repo automatically picks up new/updated commands — no reinstall needed. The slash commands become visible in Claude Code the next time a session starts.

To uninstall the symlink set:

```bash
rm ~/.claude/commands/handoff-*.md
```

Safe — removes only the symlinks; source files in this repo stay intact.

### 2. The CLI (required)

The slash commands wrap a `handoff` binary. Install it with **one** of the following.

**Once published to npm** (pending — see [`docs/PUBLISHING.md`](docs/PUBLISHING.md)):

```bash
npm install -g @im-ian/claude-handoff
```

**From source** (current path until the npm release). Requires Node.js ≥ 20:

```bash
# if you haven't cloned yet (Option A users, or Option B users skipping this)
git clone https://github.com/im-ian/claude-handoff.git
cd claude-handoff

npm install
npm run build
npm link                 # puts `handoff` on your PATH
```

Or with pnpm (requires `pnpm setup` first to configure `PNPM_HOME`):

```bash
pnpm install && pnpm build && pnpm link --global
```

Verify either way:

```bash
handoff --version        # → 0.0.1
```

### 3. Verify the full install

```bash
handoff --version        # CLI reachable on PATH
handoff status           # "Not initialized" (before `handoff init`) is a healthy result
```

In Claude Code, type `/handoff-` and the five commands should appear in autocomplete. Try `/handoff-status` — it should run and surface the same output as the terminal command.

### 4. Complete uninstall

```bash
# plugin — marketplace path
/plugin uninstall claude-handoff@claude-handoff      # inside Claude Code

# plugin — symlink path
rm ~/.claude/commands/handoff-*.md

# CLI
npm uninstall -g @im-ian/claude-handoff              # if installed from npm
npm unlink -g @im-ian/claude-handoff                 # if installed via `npm link`
# or: pnpm unlink --global @im-ian/claude-handoff

# per-device state (erases config.json and the local hub clone)
rm -rf ~/.claude-handoff
```

The hub repository on GitHub is untouched by local uninstall.

---

## Commands

### `handoff init`

Register this device and link a hub repository.

```bash
handoff init --hub <url> --device <name> [--force] [--skip-clone]
```

- `--hub <url>` — GitHub (HTTPS or SSH) or `file://` URL of the hub repo.
- `--device <name>` — lowercase identifier used as the folder name in the hub (e.g. `mbp-personal`, `work-desktop`). Default: your hostname, normalized.
- `--force` — overwrite an existing `~/.claude-handoff/config.json`.
- `--skip-clone` — write config only; do not clone the hub (useful when you'll clone manually with a specific credential helper).

Writes `~/.claude-handoff/config.json` and clones the hub into `~/.claude-handoff/hub/`.

### `handoff push`

Snapshot this machine's scoped files to the hub.

```bash
handoff push [--dry-run] [--allow-secrets | --skip-on-secrets] [-m <msg>]
```

- `--dry-run` — preview scope + scanner findings + projected commit size without any network writes, git writes, or commits.
- `--allow-secrets` — bypass the secret scanner entirely. Use **only** if you have reviewed and are sure.
- `--skip-on-secrets` — non-interactive: auto-skip any file with detected findings. Safe default for CI/scripted pushes.
- `-m, --message <msg>` — commit message override.

By default the scanner runs and prompts interactively per file when it finds something (see *Secret scanner* below).

### `handoff pull`

Apply a device's snapshot to this machine.

```bash
handoff pull [--from <device>] [--dry-run] [--confirm]
```

- `--from <device>` — source device. **If omitted**, opens an interactive picker with all devices in the hub (sorted by most recent push, current device pre-selected). In non-TTY contexts the picker falls back to an error listing known devices.
- `--dry-run` — list files that would be written without touching `~/.claude/`.
- `--confirm` — show a diff preview and require y/N before overwriting.

Pull does **not** delete local files that are missing from the snapshot; those stay.

### `handoff diff`

Preview what would change when pulling from a device.

```bash
handoff diff [--from <device>] [-p | --patch] [--files-only]
```

- `--from <device>` — source device (default: this device's own last push — useful as a pre-push sanity check).
- `-p, --patch` — include the full unified diff for each modified file inline.
- `--files-only` — list paths and status markers only; no summary.

Output markers:

- `+` file will be created by pull
- `M` text file will be overwritten (shows `+X -Y` line counts)
- `B` binary file will be overwritten
- `L` file exists only locally; pull will **not** remove it

### `handoff status`

Show the current sync state and all known devices.

```bash
handoff status
```

Prints your device name, hub remote, local clone path, hub HEAD SHA, and a table of every device registered in the hub with its last-push timestamp and file count. The current device is marked with `●`.

---

## What gets synced (scope)

`claude-handoff` uses a conservative **allowlist** so that unknown files under `~/.claude/` never leak by accident.

### Default include

- `agents/**`
- `commands/**`
- `hooks/**`
- `skills/**`
- `rules/**`
- `mcp-configs/**`
- top-level `*.md` (e.g. `CLAUDE.md`, `AGENTS.md`)

### Hard-deny (always excluded)

Runtime state, logs, and credentials — even if they happen to match an include pattern:

- `projects/**`, `sessions/**`, `session-*/**`, `shell-snapshots/**`
- `cache/**`, `paste-cache/**`, `telemetry/**`, `metrics/**`
- `backups/**`, `file-history/**`, `ide/**`, `tasks/**`, `downloads/**`
- `**/*.log`, `**/*.jsonl`
- `**/.credentials.json`, `**/.env`, `**/.env.*`, `**/*credentials*`, `**/*secret*`
- `.DS_Store`

### Customizing scope

Edit `scope` in `~/.claude-handoff/config.json`:

```json
"scope": {
  "include": ["agents/**", "commands/**", "hooks/**", "skills/**", "rules/**", "*.md"],
  "optIn": [],
  "excludeExtra": ["skills/very-personal/**"]
}
```

`excludeExtra` stacks on top of the hard-deny list.

---

## Tokenization — how cross-device paths survive

**The core problem.** Hooks and configs routinely embed absolute paths like `/Users/alice/.claude/hooks/format.sh`. Sync the file verbatim to a machine where the username is `bob` and every such path breaks.

**The fix.** Before any file leaves your machine, `push` rewrites two specific literals to placeholders:

| Token              | Replaces                               |
|--------------------|----------------------------------------|
| `${HANDOFF_CLAUDE}`| `$HOME/.claude` (absolute path)         |
| `${HANDOFF_HOME}`  | `$HOME`                                 |

On `pull`, the placeholders resolve back to the local machine's values. A line like `"command": "node \"/Users/alice/.claude/hooks/x.js\""` becomes `"command": "node \"${HANDOFF_CLAUDE}/hooks/x.js\""` in the hub, and on the receiving device it becomes `"command": "node \"/Users/bob/.claude/hooks/x.js\""` — automatically correct.

The longest pattern wins: `/Users/alice/.claude` tokenizes before `/Users/alice` so path nesting stays correct.

### Opt-in: `${HANDOFF_USER}` / `${HANDOFF_HOSTNAME}`

Bare username and hostname substitution is **not** on by default because substrings like `alice` can false-positive-match words in comments or natural-language content (`malice`, `palace`). If your hooks reference a bare username, opt in via `substitutions`:

```json
"substitutions": [
  { "from": "alice", "to": "${HANDOFF_USER}" }
]
```

---

## Secret scanner

Before any file leaves your machine, every scoped text file (≤ 2 MB; binaries skipped) is scanned for these patterns:

- Anthropic keys (`sk-ant-*`)
- OpenAI keys (`sk-*`, `sk-proj-*`)
- GitHub tokens (`gh[pousr]_*`)
- Google API keys (`AIza*`)
- AWS access key IDs (`AKIA*`)
- Slack tokens (`xox[baprs]-*`)
- Private key block headers
- JWTs
- Bearer tokens
- Generic `api_key=` / `password=` literals with enough entropy

### What happens on a finding

**Interactive (TTY).** For each file with findings you pick:

- *skip this file* — omit from the snapshot
- *upload anyway* — include as-is
- *abort entire push* — bail out without publishing anything

**Hub privacy gate.** Before prompting, the CLI calls `gh repo view <owner>/<repo> --json isPrivate` to classify the hub as `private`, `public`, or `unknown` (non-GitHub hosts). If the hub is anything other than `private`, the *upload anyway* choice additionally requires you to type `yes` in a second prompt. This is the only path by which a secret can reach a non-private hub, and it is always explicit.

**Non-interactive (CI, Bash-tool, pipelines).** The scanner refuses to guess. You must pass either:

- `--skip-on-secrets` — auto-skip any flagged file
- `--allow-secrets` — bypass the scanner entirely

Otherwise push aborts.

### Handling false positives

Teaching content (Django `SECRET_KEY = "..."` examples, test fixtures, API key documentation) frequently trips the generic patterns. Add those paths to your `secretPolicy.allow` list to silence them permanently:

```json
"secretPolicy": {
  "allow": [
    "skills/django-security/SKILL.md",
    "skills/django-tdd/SKILL.md",
    "commands/kotlin-test.md"
  ]
}
```

Additions are manual (edit the JSON) rather than auto-remembered from prompts — this prevents click-fatigue from silently growing the allow list.

---

## Configuration

`~/.claude-handoff/config.json`:

```json
{
  "device": "mbp-personal",
  "hubRemote": "https://github.com/<you>/my-claude-hub.git",
  "claudeDir": "/Users/<you>/.claude",
  "substitutions": [],
  "scope": {
    "include": ["agents/**", "commands/**", "hooks/**", "skills/**", "rules/**", "mcp-configs/**", "*.md"],
    "optIn": [],
    "excludeExtra": []
  },
  "secretPolicy": {
    "allow": []
  }
}
```

Edit the file directly for fine-grained control — the CLI will pick up changes on the next invocation. Back up before large edits.

---

## Hub repository layout

Every push lands under `devices/<device-name>/`:

```
<your-hub>/
├── devices/
│   ├── mbp-personal/
│   │   ├── snapshot/          # tokenized scoped files from this device
│   │   └── version.json       # metadata: timestamp, file count, byte count, host
│   └── work-desktop/
│       └── ...
└── manifest.json              # registry of all devices
```

Each git commit on the hub is one push from one device — **M versions × N devices** emerges naturally from the directory layout plus git history. There is no cross-device merging; every push replaces its own device's `snapshot/` wholesale, and `pull --from X` always applies X's complete state.

---

## Claude Code plugin details

Install via either path in the *Installation* section above. The slash commands and their arguments:

| Slash command     | CLI equivalent   | Pass-through arguments |
|-------------------|------------------|------------------------|
| `/handoff-init`   | `handoff init`   | `--hub <url> --device <name> --skip-clone --force` |
| `/handoff-push`   | `handoff push`   | `--dry-run --allow-secrets --skip-on-secrets -m <msg>` |
| `/handoff-pull`   | `handoff pull`   | `--from <device> --dry-run --confirm` |
| `/handoff-diff`   | `handoff diff`   | `--from <device> -p --files-only` |
| `/handoff-status` | `handoff status` | — |

Arguments pass through via `$ARGUMENTS`, so `/handoff-pull --from work-pc --confirm` works exactly as on the CLI.

### Interactive-prompt caveat

Claude Code's Bash tool is not a TTY, so any command that would open an interactive prompt fails closed rather than hanging. The CLI returns an error telling you to either run in your terminal or pass the corresponding non-interactive flag. Affected flows:

- `handoff init` with missing `--hub` / `--device` → run in terminal, or pass both flags
- `handoff push` with scanner findings → pass `--skip-on-secrets` or `--allow-secrets`
- `handoff pull` with no `--from` (multi-device hub) → pass `--from <device>`
- `handoff pull --confirm` → run in terminal

Each slash-command file documents this fallback in its body so the agent can relay it to you.

---

## Environment variables

### `CLAUDE_HANDOFF_HOME`

Overrides the config/hub location (default `~/.claude-handoff/`). Useful for:

- **Safe trial runs.** `CLAUDE_HANDOFF_HOME=/tmp/trial handoff init ...` writes config to `/tmp/` instead of your home, so experiments don't clobber real state.
- **Multi-user machines / containers.** Isolate each user's state.
- **Testing.** The test suite doesn't need it today, but the env var makes future integration tests straightforward.

---

## Troubleshooting

### `fatal: could not read Password for 'https://…@github.com'`

`git push` and `git fetch` inside the hub clone need credentials. The cleanest fix without touching your global git config is a **local** credential helper:

```bash
git -C ~/.claude-handoff/hub config --local credential.helper '!gh auth git-credential'
```

This delegates auth to whatever `gh` account is currently active. If you operate multiple GitHub accounts, `gh auth switch --user <login>` before pushing.

For the initial clone when the helper isn't set up yet:

```bash
git -c credential.helper='!gh auth git-credential' clone <hub-url> ~/.claude-handoff/hub
```

Then re-run `handoff init --hub <url> --device <name> --skip-clone` to write the config without touching the existing clone.

### Hub visibility reports `UNKNOWN`

- The hub is on a non-GitHub host (GitLab, Bitbucket, self-hosted), or
- The GitHub URL is malformed, or
- `gh` CLI is missing or not authenticated.

`claude-handoff` treats `unknown` as potentially public and requires the same typed-`yes` confirmation as a real public repo. To restore `private` status, host on GitHub and run `gh auth login`.

### The scanner keeps prompting for the same teaching-content files

Add those paths to `secretPolicy.allow` in `config.json`. The scanner will skip them entirely on future pushes.

### Diff/pull shows a lot of churn after a scope change

Scope widened → new files show as `added`. Scope narrowed → previously synced files stop being covered, but the hub snapshot doesn't prune them automatically. Run `handoff push` from the owning device to rewrite its snapshot with the current scope.

---

## Design docs

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full architecture write-up: hub layout, versioning model, tokenization rules, scope semantics, secret scanner flow, non-goals.

---

## Status

Working MVP. Used in production on at least one device. Not yet published to npm.

### Roadmap

- [ ] `handoff log --device <name>` — per-device push history
- [ ] `handoff pull --at <sha>` — restore a specific historical version
- [ ] `handoff init` auto-configures the local credential helper
- [ ] npm publish (`npm install -g claude-handoff`)
- [ ] Claude Code plugin marketplace entry

---

## Prior art

- [`claude-teleport`](https://github.com/anthropics/claude-code-plugins) — one-shot "beam my setup" flow, no per-device awareness.
- Dotfile managers (`chezmoi`, `yadm`, `stow`) — general-purpose, require manual templating for path differences.

`claude-handoff` focuses specifically on Claude Code's configuration surface, with built-in awareness of which pieces are machine-specific and which are portable — and defaults that keep secrets out.

---

## License

MIT
