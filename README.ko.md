<div align="right">

[English](README.md) | **한국어**

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
  <img src="docs/assets/hero-light.svg" alt="claude-handoff" width="100%">
</picture>

<p align="center">
  Claude Code 설정을 디바이스 간에 전달 — <code>~/.claude/</code>를 여러 머신에서 동기화.
</p>

---

## 왜 필요한가

여러 머신에서 Claude Code를 쓰다 보면 결국 홈 Mac의 `hooks.json`을 회사 Mac으로 복사하게 되는데, `/Users/홈-사용자명/`이 회사 머신에 존재하지 않아서 모든 hook이 깨집니다. `claude-handoff`는 머신 종속적인 경로를 토큰화해서 hook이 그대로 작동하도록 만들고, 머신을 떠나기 전에 secret을 스캔하며, 공유 hub 저장소를 통해 N개 디바이스 × M개 버전을 지원합니다.

---

## 빠른 시작

```bash
# 1. 플러그인 (Claude Code 안에서):
#    /plugin marketplace add im-ian/claude-handoff
#    /plugin install claude-handoff@claude-handoff

# 2. CLI (npm 패키지 준비 중):
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link

# 3. Init — PRIVATE GitHub hub 저장소까지 만들어줌:
handoff init --create-hub my-claude-hub --device my-mac

# 4. Push:
handoff push

# 5. 다른 머신에서 init + 플러그인 설치 후:
handoff pull --from my-mac
```

또는 Claude Code 안에서 `/handoff-init`, `/handoff-push`, `/handoff-pull` 사용 — 슬래시 명령어가 `AskUserQuestion`으로 프롬프트를 직접 처리하므로 CLI의 TTY 인터랙션에서 멈추지 않습니다.

---

## 설치

**플러그인** (Claude Code 안에서):

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
```

업데이트는 `/plugin update`로 따라옵니다. 기여자용 로컬 심볼릭 링크 설치는 클론 후 `plugin/install.sh` 실행 — 심볼릭 링크라 `git pull` 한 번으로 새 명령어가 반영됩니다.

**CLI** (Node.js ≥ 20):

```bash
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link    # `handoff`을 PATH에 추가
```

검증: `handoff --version` (→ `0.0.1`); `init` 전에는 `handoff status`가 `Not initialized`를 반환하는 게 정상.

**제거:**

```bash
/plugin uninstall claude-handoff@claude-handoff   # 플러그인
npm unlink -g @im-ian/claude-handoff              # CLI
rm -rf ~/.claude-handoff                          # 로컬 config + hub clone (원격 저장소는 그대로)
```

---

## 명령어

| 슬래시 | CLI | 용도 |
|---|---|---|
| `/handoff-init` | `handoff init [--hub <url> \| --create-hub <name>] --device <name>` | 디바이스 등록, hub 연결 또는 생성 |
| `/handoff-push` | `handoff push [--dry-run] [--skip-on-secrets \| --allow-secrets] [-m <msg>]` | hub로 스냅샷 (secret 스캔 포함) |
| `/handoff-pull` | `handoff pull --from <device> [--dry-run] [--confirm]` | 다른 디바이스의 스냅샷 적용 |
| `/handoff-diff` | `handoff diff [--from <device>] [-p] [--files-only]` | pull 시 변경사항 미리보기 |
| `/handoff-status` | `handoff status` | 동기화 상태 + 등록된 디바이스 |
| `/handoff-doctor` | `handoff doctor [--verbose] [--fix]` | hook이 참조하는 외부 의존성 누락 진단 |
| `/handoff-bootstrap` | `handoff bootstrap [--dry-run] [--yes]` | 선언된 의존성 중 이 머신에 없는 것 설치 |
| `/handoff-deps` | `handoff deps <add\|list\|remove> ...` | 이 디바이스의 `dependencies.json` 관리 |

각 서브커맨드에 `--help`로 전체 플래그 확인.

---

## 동기화 대상 (scope)

알 수 없는 파일이 실수로 새지 않도록 **allowlist** 방식.

- **기본 포함:** `agents/**`, `commands/**`, `hooks/**`, `skills/**`, `rules/**`, `scripts/**`, `mcp-configs/**`, `settings.json`, 최상위 `*.md`
- **항상 제외 (hard-deny):** `projects/**`, `sessions/**`, `cache/**`, `telemetry/**`, `backups/**`, `*.log`, `*.jsonl`, `**/.credentials.json`, `**/.env*`, `**/*credentials*`, `**/*secret*`, `.DS_Store`
- **커스텀:** `~/.claude-handoff/config.json`의 `scope.include` / `scope.excludeExtra` 편집. `excludeExtra`는 hard-deny 위에 누적됩니다.

---

## 토큰화 (Tokenization)

Hook 파일에는 보통 `/Users/alice/.claude/hooks/format.sh` 같은 절대 경로가 들어있습니다. 그대로 sync → 사용자명이 `bob`인 머신 → 모든 경로가 깨짐.

Push 시 두 리터럴이 placeholder로 바뀌고, pull 시 로컬 머신의 값으로 다시 치환됩니다:

| 토큰 | 대체 대상 |
|---|---|
| `${HANDOFF_CLAUDE}` | `$HOME/.claude` (절대 경로) |
| `${HANDOFF_HOME}` | `$HOME` |

따라서 `"command": "node \"/Users/alice/.claude/hooks/x.js\""`는 hub에서 `"node \"${HANDOFF_CLAUDE}/hooks/x.js\""`가 되고, bob의 머신에서는 `"node \"/Users/bob/.claude/hooks/x.js\""`로 자동 resolve됩니다. 가장 긴 패턴이 우선 매칭돼서 경로 중첩이 깨지지 않아요.

`${HANDOFF_USER}` / `${HANDOFF_HOSTNAME}`도 정의돼있지만 **기본 비활성** — 짧은 사용자명이 일반 텍스트(`alice` → `malice`/`palace`)에 오탐되기 때문. 필요하면 config의 `substitutions: [{ "from": "alice", "to": "${HANDOFF_USER}" }]`로 opt-in.

---

## Secret 스캐너

Scope 내 모든 텍스트 파일(≤ 2 MB)에 대해: Anthropic/OpenAI/GitHub/Google/AWS/Slack 토큰, private key 헤더, JWT, 일반적인 `password=` / `api_key=` 리터럴 검사.

- **인터랙티브 (터미널, TTY).** 파일별: *건너뛰기* / *그래도 업로드* / *전체 중단*. Public/unknown 가시성 hub는 추가로 `yes` 타이핑 확인 요구.
- **비인터랙티브 (CI, Bash tool, 슬래시 명령어).** `--skip-on-secrets` (탐지된 파일 자동 스킵) 또는 `--allow-secrets` (스캔 전체 우회) 중 하나를 명시. `/handoff-push` 슬래시 명령은 `--dry-run` preflight로 finding을 먼저 보여준 뒤 `AskUserQuestion`으로 정책을 결정합니다.
- **False positive** (Django `SECRET_KEY` 예제, 테스트 픽스처, password 패턴 문서) → 파일 경로를 config의 `secretPolicy.allow`에 추가. 수동 편집만 — 프롬프트 클릭 피로로 allow list가 슬그머니 늘어나는 걸 방지.

---

## 의존성 관리

Hook은 보통 외부 CLI(`gh`, `jq`, `clawd`, `rtk`, …)를 호출합니다. 새 머신에 pull 받으면 그 바이너리가 설치돼있지 않을 수 있고, hook이 런타임에 조용히 실패합니다. 세 개의 명령어로 처리:

- **`handoff doctor`** — `hooks/hooks.json`을 파싱해서 시스템 도구가 아닌 바이너리를 식별, 각각 `command -v`로 존재 확인, 누락 시 파일:라인 컨텍스트와 manifest 기반 fix 제안 출력.
- **`handoff deps add <name> --darwin "<cmd>" --linux "<cmd>"`** — 이 디바이스의 manifest(`<hub>/devices/<name>/dependencies.json`)에 install 명령 등록. 자동 commit + push.
- **`handoff bootstrap`** — manifest 읽고, 누락된 deps의 install plan 보여주고, 확인 받고, 실행(`shell: true`), 재검증. Pull은 *절대* 자동 설치하지 않음; bootstrap은 항상 명시적.

```bash
handoff deps add gh --darwin "brew install gh" --linux "apt install gh"
handoff doctor       # gh가 이제 declared 상태인지, 다른 누락은 없는지 확인
handoff bootstrap    # 누락된 declared deps 설치
```

v1은 `hooks/hooks.json`에서만 검출; `scripts/**/*.sh` 파싱은 v1.1로.

---

## Hub 저장소 레이아웃

```
<hub>/
├── devices/<name>/
│   ├── snapshot/         # 토큰화된 scope 파일
│   └── version.json      # 타임스탬프, 파일 개수, 바이트 수, host
└── manifest.json         # 모든 디바이스 레지스트리
```

Hub의 git commit 하나 = 한 디바이스의 push 한 번. **N개 디바이스 × M개 버전**이 git 히스토리로 자연스럽게 표현됩니다. 디바이스 간 merge는 없음 — `pull --from X`는 항상 X의 전체 스냅샷을 원자적으로 적용.

---

## 설정

`~/.claude-handoff/config.json` — 전체 스키마는 [`docs/DESIGN.md`](docs/DESIGN.md) 참조.

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

`CLAUDE_HANDOFF_HOME` 환경변수로 config/hub 위치 변경 가능 (기본 `~/.claude-handoff/`) — 안전한 시범 실행(`CLAUDE_HANDOFF_HOME=/tmp/trial handoff init …`)이나 공유 환경에서의 사용자별 격리에 유용.

---

## 트러블슈팅

- **`fatal: could not read Password for 'https://…@github.com'`** — hub clone에 로컬 credential helper 설정:
  ```bash
  git -C ~/.claude-handoff/hub config --local credential.helper '!gh auth git-credential'
  ```
  여러 계정 사용 시: `gh auth switch --user <login>` 먼저.

- **Hub 가시성이 `UNKNOWN`** — GitHub 외 호스트이거나 `gh` 미설치/미인증. Public으로 간주되어 finding 있는 파일마다 `yes` 타이핑 확인 요구.

- **Scope 변경 후 churn** — 확장 시 새 파일이 `added`로 표시; 축소 시 hub의 오래된 파일이 자동 정리되지 않음 (auto-prune 없음). 해당 디바이스에서 다시 push해서 스냅샷을 재작성하면 됩니다.

---

## 상태

**v1.0.0** — 안정 버전. 여러 디바이스에서 실제 운영 중. npm 배포 예정.

**로드맵:** `handoff log --device <name>`, `handoff pull --at <sha>`, `init` 시 credential helper 자동 설정, `doctor`의 `scripts/**/*.sh` 파싱, npm 배포.

---

## 선행 사례

- [`claude-teleport`](https://github.com/anthropics/claude-code-plugins) — 일회성 beam, 디바이스 인식 없음.
- Dotfile 매니저 (`chezmoi`, `yadm`, `stow`) — 범용 도구라 경로 차이 처리에 수동 템플릿 필요.

`claude-handoff`는 Claude Code 전용 — 어떤 부분이 머신 종속이고 어떤 부분이 이식 가능한지 알고, secret이 새지 않는 기본값을 가집니다.

---

## 라이선스

MIT
