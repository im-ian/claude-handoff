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
| `handoff pull [--from <device>] [--at <sha>]` | Resolve + apply another device's snapshot to `~/.claude/` |
| `handoff status` | Show current device, hub remote, last push/pull, diff summary |

## Non-goals (MVP)

- Real-time / watch-mode sync
- Automatic conflict merging
- Team / shared-profile support
- GUI
