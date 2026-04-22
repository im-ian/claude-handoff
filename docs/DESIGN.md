# claude-handoff — Design

## Problems we are solving

### P1 — Per-device identity drift
Hooks, settings, and sub-agent definitions regularly embed machine-specific literals:
- absolute paths like `/Users/jthefloor/...`
- OS usernames like `jthefloor`
- hostnames like `macbook-pro.local`

When synced verbatim across PCs (work ↔ home), these break on the receiving device.

### P2 — Many devices, many versions
A single user may run Claude Code on 3+ machines. A simple "one canonical source" model forces lossy merges. We need **N devices × M versions** — each device keeps its own history, and any device can selectively pull another device's state.

## Model

### Hub repository layout

```
<hub-repo>/
├── devices/
│   ├── macbook-pro/
│   │   ├── snapshot/           # tokenized ~/.claude/ subset
│   │   │   ├── agents/
│   │   │   ├── hooks/
│   │   │   ├── skills/
│   │   │   └── ...
│   │   └── version.json        # metadata for this device's latest push
│   ├── desktop-home/
│   │   └── ...
│   └── work-pc/
│       └── ...
├── manifest.json               # registry of all known devices
└── .handoff/
    └── README.md               # hub-level notes
```

### Versioning — N × M

- Each **device** owns its own directory under `devices/<device-name>/`.
- Each **push** from a device is a git commit that updates that device's directory.
- Git history provides M versions per device; `devices/` enumerates N devices.
- A device can pull:
  - **own latest** (re-sync this machine with what it last pushed)
  - **peer device** (`handoff pull --from work-pc`) → applies another device's state locally after token resolution
  - **specific version** (`handoff pull --from work-pc --at <sha>`)
- No implicit merging — pulls are explicit, user-directed operations.

### Tokenization (P1 solution)

Before pushing, we rewrite device-specific literals in text files to tokens:

| Token                  | Replaces                                  |
|------------------------|-------------------------------------------|
| `${HANDOFF_CLAUDE}`    | `$HOME/.claude` (absolute path)            |
| `${HANDOFF_HOME}`      | `$HOME`                                    |
| `${HANDOFF_USER}`      | local username (`$USER`)                   |
| `${HANDOFF_HOSTNAME}`  | local hostname                             |
| custom                 | user-defined extra substitutions           |

**On push** — substitute literal → token (longest match first to avoid partial overlap).
**On pull** — substitute token → local literal.

Tokenization applies only to text files; binaries are copied byte-for-byte. Files that should never be tokenized (e.g., credentials, logs) are excluded by scope rules.

### Secret scanning on push

Before any file leaves the device, `push` scans every scoped text file (binaries and files > 2 MB are skipped) against a curated pattern list: Anthropic / OpenAI / GitHub / Google / AWS / Slack keys, private-key block headers, JWTs, Bearer tokens, and generic `api_key` / `password` literals with enough entropy to look deliberate.

**Per-file user decision (interactive TTY).** For each file with findings the user picks one of:
- *skip this file* — omit from the snapshot; `pull` on other devices will not see it
- *upload anyway* — include it as-is
- *abort entire push* — bail out without publishing anything

**Hub privacy gate.** Before prompting, the CLI runs `gh repo view <owner>/<repo> --json isPrivate` to classify the hub as `private` / `public` / `unknown`. When visibility is anything but `private`, "upload anyway" additionally requires the user to type `yes` in a second prompt — this is the only path by which secrets can reach a non-private hub, and it is always explicit.

**Non-interactive fallback.** If stdin is not a TTY the scanner refuses to guess: the user must pass either `--skip-on-secrets` (auto-skip any flagged file) or `--allow-secrets` (bypass scanner entirely). This keeps CI / scripted pushes deterministic.

**Policy persistence.** `DeviceConfig.secretPolicy.allow: string[]` is a per-device allowlist of relative paths the scanner should not inspect at all — intended for files where a token-shaped string is a deliberate template placeholder, not an actual credential. Additions to this list are manual (edit `~/.claude-handoff/config.json`) rather than auto-remembered from prompts, to avoid "click fatigue" turning into silent allowlist growth.

### Scope (what gets synced)

**Default allowlist** (conservative — to avoid leaking unknown files):

- `agents/`, `commands/`, `hooks/`, `skills/`, `rules/`, `mcp-configs/`
- top-level `*.md` (e.g., `CLAUDE.md`, `AGENTS.md`)

**Opt-in** (may include machine-specific state):

- `plugins/` — some plugins store device-specific config
- `settings.json` — user-level settings

**Hard-deny** (blocked even if matched):

- anything under `projects/`, `sessions/`, `session-*`, `cache/`, `paste-cache/`, `telemetry/`, `shell-snapshots/`, `backups/`, `file-history/`, `ide/`
- `*.log`, `*.jsonl`
- `.credentials.json`, any `.env*`
- files matching common secret patterns (API keys, tokens)

### Local state

```
~/.claude-handoff/
├── config.json        # device name, hub URL, tokens, scope overrides
└── hub/               # local git clone of the hub repo
```

### Device config (`~/.claude-handoff/config.json`)

```json
{
  "device": "macbook-pro",
  "hubRemote": "git@github.com:user/my-claude-hub.git",
  "claudeDir": "/Users/jthefloor/.claude",
  "substitutions": [
    { "from": "/Users/jthefloor", "to": "${HANDOFF_HOME}" },
    { "from": "jthefloor", "to": "${HANDOFF_USER}" }
  ],
  "scope": {
    "include": ["agents/", "commands/", "hooks/", "skills/", "rules/", "mcp-configs/", "*.md"],
    "opt_in": [],
    "exclude_extra": []
  }
}
```

## Commands (MVP)

| Command | Purpose |
|---------|---------|
| `handoff init` | Register this device, clone/link hub repo, write local config |
| `handoff push` | Tokenize + copy scoped files to `hub/devices/<this>/snapshot/`, commit, push |
| `handoff pull [--from <device>]` | Resolve + apply another device's snapshot to `~/.claude/` |
| `handoff diff [--from <device>] [-p]` | Preview changes before a pull — token-aware, binary-aware, shows unified patches |
| `handoff status` | Show current device, hub remote, known devices, last push timestamps |

Future: `handoff pull --at <sha>` (historical version), `handoff log --device <name>` (per-device history).

### `diff` — semantics

- Default (no `--from`) compares local ↔ *this device's last pushed snapshot*, which doubles as a pre-push preview.
- Snapshot content is run through token **resolution** before comparison — so a file that only differs by `${HANDOFF_HOME}` vs. the local absolute path reports as `unchanged`, not `modified`. This matches the invariant that `tokenize` on push followed by `resolve` on pull is an identity transform on the same device.
- Binary files are compared by SHA-256, not byte-diffed.
- Files present locally but absent from the snapshot (`deleted` in diff output) are marked with `L`. `pull` does **not** remove them — this is explicit so the user is never surprised by silent deletions. Removing files on the hub requires pushing from the device that owns those files.

## Non-goals (MVP)

- Real-time / watch-mode sync
- Automatic conflict merging
- Team / shared-profile support
- GUI
