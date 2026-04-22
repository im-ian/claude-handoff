<div align="right">

[English](README.md) | **한국어**

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
  <img src="docs/assets/hero-light.svg" alt="claude-handoff" width="100%">
</picture>

<p align="center">
  Claude Code 설정을 디바이스 간에 전달 — <code>~/.claude/</code>를 슬래시 명령어로 여러 머신에 동기화.
</p>

---

## 왜 필요한가

회사 PC와 집 PC에서 둘 다 Claude Code를 쓰다 보면, 한쪽에서 추가한 hook이나 skill을 다른 쪽으로 옮기는 일이 의외로 번거롭습니다. `hooks.json`을 그냥 복사해봐야 `/Users/집-계정/…` 같은 절대 경로가 회사 PC엔 존재하지 않아서 hook이 전부 깨지고, skill·agent·rule도 일일이 직접 옮겨야 하죠.

`claude-handoff`는 이 동기화 과정을 자동화합니다. PC마다 달라지는 경로는 토큰으로 치환해서 어느 머신에서든 그대로 작동하게 만들고, 업로드 전에 API 키 같은 민감 정보가 섞이지 않았는지 스캔하며, 공유 hub 저장소로 여러 PC의 여러 버전 설정을 한 곳에서 관리합니다.

전부 Claude Code 안의 슬래시 명령어로 끝 — 터미널 왔다갔다하거나 플래그 외울 일 없습니다.

---

## 빠른 시작

Claude Code 안에서:

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
/reload-plugins
```

한 번만 터미널 (npm 배포 대기 중 — [설치](#설치) 참조):

```bash
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link
```

다시 Claude Code로 돌아와서:

```
/handoff-init       # 몇 가지 질문 후 PRIVATE GitHub hub 저장소까지 생성
/handoff-push       # ~/.claude/를 hub로 스냅샷
```

다른 머신에서도 동일 설치 + `/handoff-init` 후:

```
/handoff-pull       # 소스 디바이스 선택, diff 미리보기, 적용
```

모든 슬래시 명령어가 프롬프트를 `AskUserQuestion`으로 처리(디바이스 picker, secret 스캔 정책, 설치 확인) — CLI 인터랙티브 멈춤 없고, 외울 플래그도 없습니다.

---

## 설치

### 1. 플러그인 (Claude Code 안에서)

```
/plugin marketplace add im-ian/claude-handoff
/plugin install claude-handoff@claude-handoff
/reload-plugins
```

업데이트는 `/plugin update`로 따라옵니다.

### 2. `handoff` CLI 백엔드

플러그인은 얇은 래퍼 — 모든 슬래시 명령어가 PATH 상의 `handoff` 바이너리를 호출합니다. npm 배포 전까지는 소스에서 빌드:

```bash
git clone https://github.com/im-ian/claude-handoff.git && cd claude-handoff
npm install && npm run build && npm link
```

Claude Code에서 `/handoff-status` 실행해서 "command not found" 없이 나오면 완료. 터미널에서 `handoff --version`은 `1.0.0`을 출력.

### 제거

```
/plugin uninstall claude-handoff@claude-handoff
```

```bash
npm unlink -g @im-ian/claude-handoff   # CLI
rm -rf ~/.claude-handoff               # 로컬 config + hub clone (원격 저장소는 그대로)
```

---

## 슬래시 명령어

| 명령어 | 용도 |
|---|---|
| `/handoff-init` | 이 디바이스 등록, hub 저장소 연결 또는 생성. hub 설정과 device 이름을 인터랙티브로 선택. |
| `/handoff-push` | `~/.claude/`를 hub로 스냅샷. 먼저 `--dry-run`으로 secret 스캔 → finding 있으면 `AskUserQuestion`으로 skip/allow/abort. |
| `/handoff-pull` | 다른 디바이스의 스냅샷 적용. 디바이스 목록 표시, diff 미리보기, 덮어쓰기 전 확인. |
| `/handoff-diff` | pull이 바꿀 내용을 적용 없이 미리보기. |
| `/handoff-status` | 이 디바이스 등록 정보, hub URL, 등록된 모든 디바이스의 마지막 push 시점. |
| `/handoff-doctor` | `hooks.json`이 참조하는 외부 의존성 중 누락된 것을 진단 — 어디서 쓰이는지, 어떻게 설치하는지 표시. |
| `/handoff-bootstrap` | 선언된 deps 중 이 머신에 없는 것 설치. 항상 plan 먼저 보여주고 확인 후 실행. |
| `/handoff-deps` | 디바이스별 `dependencies.json` 관리 (`add <name> --darwin "..." --linux "..."` / `list` / `remove`). |

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

- **`/handoff-push`에서.** `--dry-run` preflight로 finding을 먼저 보여준 뒤 `AskUserQuestion`으로 skip/allow/abort 선택. Public/unknown 가시성 hub는 추가 경고 표시.
- **터미널, 인터랙티브.** 파일별 프롬프트: *건너뛰기* / *그래도 업로드* / *전체 중단*. Non-private hub는 추가로 `yes` 타이핑 확인 요구.
- **False positive** (Django `SECRET_KEY` 예제, 테스트 픽스처, password 패턴 문서) → 파일 경로를 config의 `secretPolicy.allow`에 추가. 수동 편집만 — 프롬프트 클릭 피로로 allow list가 슬그머니 늘어나는 걸 방지.

---

## 의존성 관리

Hook은 보통 외부 CLI(`gh`, `jq`, `clawd`, `rtk`, …)를 호출합니다. 새 머신에 pull 받으면 그 바이너리가 설치돼있지 않을 수 있고, hook이 런타임에 `command not found`로 조용히 실패합니다. 세 개의 슬래시 명령어로 처리:

```
/handoff-deps add gh --darwin "brew install gh" --linux "apt install gh"
/handoff-doctor            # gh가 declared 상태인지, 다른 누락 확인
/handoff-bootstrap         # 누락된 declared deps 설치 (plan 먼저 보여주고 확인)
```

- **`/handoff-doctor`** — read-only로 `hooks/hooks.json` 스캔. 누락된 바이너리를 파일:라인 컨텍스트 + manifest 기반 fix 제안과 함께 출력.
- **`/handoff-deps add/list/remove`** — 디바이스별 manifest(`<hub>/devices/<name>/dependencies.json`) 편집. `add`/`remove`는 자동 commit + push.
- **`/handoff-bootstrap`** — PATH에 없는 declared deps 설치. 항상 install plan 먼저 출력하고 확인 필수. Pull은 *절대* 자동 설치하지 않음.

v1은 `hooks/hooks.json`에서만 검출; `scripts/**/*.sh` 파싱은 v1.1로.

---

## Hub 저장소 레이아웃

```
<hub>/
├── devices/<name>/
│   ├── snapshot/            # 토큰화된 scope 파일
│   ├── version.json         # 타임스탬프, 파일 개수, 바이트 수, host
│   └── dependencies.json    # 이 디바이스가 선언한 외부 의존성
└── manifest.json            # 모든 디바이스 레지스트리
```

Hub의 git commit 하나 = 한 디바이스의 push 한 번. **N개 디바이스 × M개 버전**이 git 히스토리로 자연스럽게 표현됩니다. 디바이스 간 merge는 없음 — `/handoff-pull --from X`는 항상 X의 전체 스냅샷을 원자적으로 적용.

---

## 설정

`~/.claude-handoff/config.json` — 전체 스키마는 [`docs/DESIGN.md`](docs/DESIGN.md) 참조. 대부분은 이 파일을 직접 만질 일 없음 — `/handoff-init`이 합리적인 기본값을 써줍니다.

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

## 터미널 사용 (선택)

모든 슬래시 명령어는 셸에서 대응되는 `handoff <subcommand>`의 얇은 래퍼입니다. 터미널이 편하면 `handoff init`, `handoff push`, `handoff pull --from <device>`, `handoff doctor` 등 모두 동일하게 작동 — 같은 플래그, 같은 출력. 전체 플래그는 `handoff <cmd> --help`.

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

**로드맵:** `handoff log --device <name>`, `handoff pull --at <sha>`, `init` 시 credential helper 자동 설정, `doctor`의 `scripts/**/*.sh` 파싱, SessionStart-hook 통합(opt-in "soft handoff"), npm 배포.

---

## 관련 프로젝트

[`claude-teleport`](https://github.com/seilk/claude-teleport) ([@seilk](https://github.com/seilk))는 같은 공간을 다루는 프로젝트("private GitHub repo를 통해 Claude Code 설정을 머신 간 동기화")이며, `claude-handoff`는 여기서 직접 영감을 받았습니다. 두 프로젝트는 아키텍처 선택이 달라서, 선택 전에 차이를 이해하는 게 좋아요:

| | claude-teleport | claude-handoff |
|---|---|---|
| 저장 모델 | 디바이스당 branch, `main`에 자동 merge | 디바이스당 디렉토리(`devices/<name>/`)를 `main` 위에, merge 없음 |
| 머신 간 경로 | 그대로 동기화 | 토큰화 — `${HANDOFF_CLAUDE}` / `${HANDOFF_HOME}`으로 `/Users/alice/…` hook이 `/Users/bob/…`에서도 동작 |
| 외부 의존성 추적 | — | `doctor` / `bootstrap` / `deps`로 hook이 참조하는 CLI의 누락 진단 |
| Public 공유 | `teleport-share` / `teleport-from <user>` | Private hub 전용 (설계상) |
| Plugin 캐시 | 동기화 (plugins + marketplaces 포함) | 제외 — 각 머신에서 `/plugin install`로 재설치 |

Branch-merge 기반 단일 source-of-truth와 public 공유가 필요하면 teleport, 디바이스별 격리 + 경로 토큰화 + 외부 의존성 추적이 필요하면 claude-handoff를 고르세요.

**왜 PR이 아니라 별도 프로젝트인가?** 저장 모델(directory vs. branch), 경로 토큰화, 의존성 추적 표면은 모든 명령어에 걸쳐 있어서 — patch가 아니라 같은 문제 공간에서의 다른 tradeoff 세트입니다. seilk의 설계는 그의 use case에 일관성 있고, `claude-handoff`는 다른 지점을 탐색합니다.

Dotfile 매니저 (`chezmoi`, `yadm`, `stow`)도 범용 sync 문제를 풀지만, 경로 차이 처리에 수동 템플릿이 필요합니다. 위 두 프로젝트는 Claude Code의 디렉토리 구조를 미리 알고 있어서 그 단계를 건너뛸 수 있어요.

---

## 라이선스

MIT
