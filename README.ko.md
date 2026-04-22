<div align="right">

[English](README.md) | **한국어**

</div>

# claude-handoff

기기 간에 Claude Code 세팅을 이어주는 도구 — Apple Handoff처럼, 하지만 `~/.claude/` 를 위한.

> agents, commands, hooks, skills, rules를 모든 작업 기기에서 동일하게 유지합니다. 기기별 경로나 시크릿을 유출하지 않고.

---

## 왜 필요한가

Claude Code를 여러 대의 기기(노트북, 데스크탑, 회사 PC, 서버)에서 쓴다면 아마 이런 경험이 있을 겁니다:

- 유용한 hook을 한 기기에 설치 → 다른 기기에 미러링하는 걸 까먹음
- agent 프롬프트를 조금 손봤는데 → 일주일 안에 두 기기 설정이 벌어짐
- 새 기기를 셋업 → 처음부터 다시 구성하느라 한 시간 소모
- 최악의 경우: 집 맥에서 `hooks.json`을 회사 맥에 복사했더니 `/Users/home-username/` 경로가 회사 맥에 존재하지 않아서 모든 hook이 깨짐

`claude-handoff`는 Claude Code 설정을 일급 객체로, 기기를 인지하는 sync 대상으로 다룹니다. 기기별 경로를 토큰화해서 다른 기기에서도 hook이 그대로 동작하게 하고, 무언가 올라가기 전에 시크릿을 스캔하며, 공유 hub 레포를 통해 N개 기기 × M개 버전을 지원합니다.

---

## 빠른 시작

```bash
# 1. 설치 (소스에서 — npm 패키지는 추후 배포 예정)
git clone https://github.com/im-ian/claude-handoff.git
cd claude-handoff
pnpm install && pnpm build && pnpm link --global

# 2. PRIVATE hub 레포 생성 (GitHub 예시)
gh repo create my-claude-hub --private

# 3. 이 기기 등록
handoff init --hub https://github.com/<you>/my-claude-hub.git --device my-macbook

# 4. 올라갈 내용 미리보기
handoff push --dry-run

# 5. 실제 push
handoff push

# 6. 다른 기기에서 `handoff init` 한 뒤:
handoff pull --from my-macbook --confirm
```

이게 전부입니다. 아래는 세부 사항.

---

## 설치

Node.js 20 이상과 `pnpm` (또는 `npm`)이 필요합니다.

```bash
git clone https://github.com/im-ian/claude-handoff.git
cd claude-handoff
pnpm install
pnpm build
pnpm link --global       # PATH에 `handoff` 등록

handoff --version
```

제거: `pnpm unlink --global claude-handoff`.

---

## 명령어

### `handoff init`

현재 기기를 등록하고 hub 레포와 연결합니다.

```bash
handoff init --hub <url> --device <name> [--force] [--skip-clone]
```

- `--hub <url>` — hub 레포의 GitHub(HTTPS/SSH) 또는 `file://` URL
- `--device <name>` — hub 내 폴더 이름으로 사용될 소문자 식별자 (예: `mbp-personal`, `work-desktop`). 기본값: 정규화된 호스트명
- `--force` — 기존 `~/.claude-handoff/config.json`을 덮어씁니다
- `--skip-clone` — 설정만 쓰고 hub는 clone하지 않습니다 (특정 credential helper로 수동 clone할 때 유용)

`~/.claude-handoff/config.json`에 설정을 저장하고 `~/.claude-handoff/hub/`에 hub를 clone합니다.

### `handoff push`

현재 기기의 scope 내 파일을 hub로 스냅샷합니다.

```bash
handoff push [--dry-run] [--allow-secrets | --skip-on-secrets] [-m <msg>]
```

- `--dry-run` — 네트워크/파일 쓰기/커밋 없이 scope, 스캐너 결과, 예상 커밋 크기를 미리 봅니다
- `--allow-secrets` — 시크릿 스캐너를 완전히 건너뜁니다. **확실히** 검토한 경우에만 사용
- `--skip-on-secrets` — 비대화형: 감지된 파일을 자동으로 건너뜁니다. CI/스크립트 push에 적합
- `-m, --message <msg>` — 커밋 메시지 덮어쓰기

기본적으로 스캐너가 돌고, 감지된 파일마다 대화형 프롬프트가 뜹니다 (아래 *시크릿 스캐너* 참조).

### `handoff pull`

다른 기기의 스냅샷을 현재 기기에 적용합니다.

```bash
handoff pull [--from <device>] [--dry-run] [--confirm]
```

- `--from <device>` — 소스 기기. **생략 시** hub 내 모든 기기의 목록이 인터랙티브 picker로 뜹니다 (최근 push 순 정렬, 현재 기기 커서 기본). 비-TTY 환경에서는 알려진 디바이스 목록과 함께 에러로 대체됩니다
- `--dry-run` — `~/.claude/`를 건드리지 않고 쓰여질 파일 목록만 출력
- `--confirm` — diff 프리뷰를 보여주고 적용 전 y/N 확인

pull은 **스냅샷에 없는 로컬 파일을 지우지 않습니다** — 그대로 남습니다.

### `handoff diff`

특정 기기에서 pull하면 뭐가 바뀔지 미리 봅니다.

```bash
handoff diff [--from <device>] [-p | --patch] [--files-only]
```

- `--from <device>` — 소스 기기 (기본값: 현재 기기의 마지막 push — push 전 점검용으로 유용)
- `-p, --patch` — 수정된 파일마다 전체 unified diff를 인라인 표시
- `--files-only` — 경로와 상태 마커만; 요약 없음

출력 마커:

- `+` pull이 새로 생성할 파일
- `M` pull이 덮어쓸 text 파일 (`+X -Y` 라인 수 표시)
- `B` pull이 덮어쓸 binary 파일
- `L` 로컬에만 있음; pull이 **지우지 않음**

### `handoff status`

현재 sync 상태와 알려진 모든 기기를 보여줍니다.

```bash
handoff status
```

기기 이름, hub remote, 로컬 clone 경로, hub HEAD SHA, 그리고 hub에 등록된 모든 기기의 마지막 push 시각 및 파일 수를 출력합니다. 현재 기기는 `●`로 표시됩니다.

---

## Sync 대상 (scope)

`claude-handoff`는 보수적인 **allowlist** 방식을 씁니다. `~/.claude/` 아래의 알 수 없는 파일이 실수로 유출되는 일을 막기 위해서입니다.

### 기본 포함

- `agents/**`
- `commands/**`
- `hooks/**`
- `skills/**`
- `rules/**`
- `mcp-configs/**`
- 최상위 `*.md` 파일 (예: `CLAUDE.md`, `AGENTS.md`)

### 하드 제외 (include 패턴과 겹쳐도 항상 제외)

런타임 상태, 로그, 크레덴셜:

- `projects/**`, `sessions/**`, `session-*/**`, `shell-snapshots/**`
- `cache/**`, `paste-cache/**`, `telemetry/**`, `metrics/**`
- `backups/**`, `file-history/**`, `ide/**`, `tasks/**`, `downloads/**`
- `**/*.log`, `**/*.jsonl`
- `**/.credentials.json`, `**/.env`, `**/.env.*`, `**/*credentials*`, `**/*secret*`
- `.DS_Store`

### Scope 커스터마이즈

`~/.claude-handoff/config.json`의 `scope` 섹션을 편집:

```json
"scope": {
  "include": ["agents/**", "commands/**", "hooks/**", "skills/**", "rules/**", "*.md"],
  "optIn": [],
  "excludeExtra": ["skills/very-personal/**"]
}
```

`excludeExtra`는 하드 제외 리스트 위에 쌓입니다.

---

## 토큰화 — 기기 간 경로가 살아남는 방법

**핵심 문제.** Hook과 설정 파일은 흔히 `/Users/alice/.claude/hooks/format.sh` 같은 절대 경로를 포함합니다. 이 파일을 username이 `bob`인 기기에 그대로 sync하면 모든 경로가 깨집니다.

**해결.** 파일이 기기를 떠나기 전, `push`는 특정 리터럴 두 개를 플레이스홀더로 치환합니다:

| 토큰               | 치환 대상                                |
|--------------------|------------------------------------------|
| `${HANDOFF_CLAUDE}`| `$HOME/.claude` (절대 경로)               |
| `${HANDOFF_HOME}`  | `$HOME`                                   |

`pull` 시에는 플레이스홀더가 로컬 기기의 실제 값으로 복원됩니다. 예를 들어 `"command": "node \"/Users/alice/.claude/hooks/x.js\""` 는 hub에서는 `"command": "node \"${HANDOFF_CLAUDE}/hooks/x.js\""` 로 저장되고, 받는 쪽 기기에서는 `"command": "node \"/Users/bob/.claude/hooks/x.js\""` 로 자동 변환됩니다.

가장 긴 패턴이 우선합니다: `/Users/alice/.claude`가 `/Users/alice`보다 먼저 매칭되어 경로 계층이 올바르게 유지됩니다.

### Opt-in: `${HANDOFF_USER}` / `${HANDOFF_HOSTNAME}`

Bare username과 hostname 치환은 **기본 활성화되지 않습니다**. `alice` 같은 짧은 문자열이 주석이나 자연어 텍스트에서 다른 단어(`malice`, `palace`)의 부분으로 잘못 매칭될 수 있기 때문입니다. hook이 bare username을 참조한다면 `substitutions`로 opt-in:

```json
"substitutions": [
  { "from": "alice", "to": "${HANDOFF_USER}" }
]
```

---

## 시크릿 스캐너

파일이 기기를 떠나기 전에, scope 내 모든 text 파일 (≤ 2 MB, 바이너리 제외)을 아래 패턴으로 스캔합니다:

- Anthropic 키 (`sk-ant-*`)
- OpenAI 키 (`sk-*`, `sk-proj-*`)
- GitHub 토큰 (`gh[pousr]_*`)
- Google API 키 (`AIza*`)
- AWS 액세스 키 ID (`AKIA*`)
- Slack 토큰 (`xox[baprs]-*`)
- Private key 블록 헤더
- JWT
- Bearer 토큰
- 엔트로피 충분한 일반 `api_key=` / `password=` 리터럴

### 감지 시 동작

**인터랙티브 (TTY).** 감지된 파일마다 선택:

- *skip this file* — 스냅샷에서 제외
- *upload anyway* — 그대로 포함
- *abort entire push* — 아무것도 올리지 않고 중단

**Hub privacy 게이트.** 프롬프트를 띄우기 전에, CLI가 `gh repo view <owner>/<repo> --json isPrivate`를 호출해서 hub를 `private`, `public`, `unknown` (비-GitHub)으로 분류합니다. hub가 `private`이 아닐 경우, *upload anyway*를 선택해도 두 번째 프롬프트에서 `yes`를 직접 타이핑해야 합니다. 시크릿이 비-private hub에 도달할 수 있는 유일한 경로이며, 항상 명시적 동작을 요구합니다.

**비-인터랙티브 (CI, Bash 도구, 파이프라인).** 스캐너는 추측하지 않습니다. 아래 중 하나를 명시해야 합니다:

- `--skip-on-secrets` — 감지된 파일 자동 스킵
- `--allow-secrets` — 스캐너 완전 우회

그 외에는 push가 중단됩니다.

### False positive 처리

교육용 콘텐츠 (Django `SECRET_KEY = "..."` 예시, 테스트 픽스처, API 키 문서)는 일반 패턴에 자주 걸립니다. 해당 경로를 `secretPolicy.allow` 목록에 추가하면 영구적으로 silence됩니다:

```json
"secretPolicy": {
  "allow": [
    "skills/django-security/SKILL.md",
    "skills/django-tdd/SKILL.md",
    "commands/kotlin-test.md"
  ]
}
```

프롬프트로부터 자동 기억되는 대신 JSON을 수동 편집해야 합니다 — 실수로 allow 목록이 조용히 늘어나는 것을 방지하기 위함입니다.

---

## 설정

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

세밀한 제어를 위해 파일을 직접 편집하세요 — 다음 CLI 실행 시 변경사항이 반영됩니다. 큰 변경 전 백업 권장.

---

## Hub 레포 구조

모든 push는 `devices/<device-name>/` 아래에 저장됩니다:

```
<your-hub>/
├── devices/
│   ├── mbp-personal/
│   │   ├── snapshot/          # 이 기기의 토큰화된 scope 파일들
│   │   └── version.json       # 메타데이터: 타임스탬프, 파일 수, 바이트 수, 호스트
│   └── work-desktop/
│       └── ...
└── manifest.json              # 모든 기기의 레지스트리
```

hub의 각 git 커밋은 한 기기의 한 번의 push입니다 — **N개 기기 × M개 버전**이 디렉토리 구조와 git 히스토리에서 자연스럽게 발현됩니다. 기기 간 머지는 없습니다; 각 push는 자기 기기의 `snapshot/`을 통째로 교체하고, `pull --from X`는 항상 X의 완전한 상태를 적용합니다.

---

## Claude Code 플러그인 (슬래시 커맨드)

`plugin/` 디렉토리가 `handoff`를 Claude Code 슬래시 커맨드로 노출합니다.

### 설치

```bash
plugin/install.sh
```

`plugin/commands/*.md`를 `~/.claude/commands/`에 symlink합니다. symlink이기 때문에 이 레포를 `git pull`하면 업데이트가 자동으로 반영됩니다.

### 제공 커맨드

- `/handoff-init` → `handoff init`
- `/handoff-push` → `handoff push`
- `/handoff-pull` → `handoff pull`
- `/handoff-diff` → `handoff diff`
- `/handoff-status` → `handoff status`

인자는 `$ARGUMENTS`로 전달됩니다. 즉 `/handoff-pull --from work-pc --confirm`이 그대로 동작합니다.

### 주의사항

Claude Code의 Bash 도구는 TTY가 아니라서 인터랙티브 프롬프트를 슬래시 커맨드로 스트리밍할 수 없습니다. 프롬프트가 필요한 상황(시크릿 review, pull picker, `--confirm` y/N)에서 CLI는 에러를 반환하며, 터미널에서 직접 실행하거나 해당 비-인터랙티브 플래그(`--skip-on-secrets`, `--from <device>` 등)를 쓰도록 안내합니다. 각 커맨드 파일이 이 fallback을 문서화하고 있습니다.

### 제거

```bash
rm ~/.claude/commands/handoff-*.md
```

symlink이므로 안전합니다 — 이 레포의 원본 파일은 그대로 유지됩니다.

---

## 환경 변수

### `CLAUDE_HANDOFF_HOME`

config/hub 위치를 덮어씁니다 (기본값 `~/.claude-handoff/`). 용도:

- **안전한 시범 실행.** `CLAUDE_HANDOFF_HOME=/tmp/trial handoff init ...` 은 홈 대신 `/tmp/`에 설정을 쓰므로 실제 상태가 섞이지 않습니다
- **다중 사용자 기기 / 컨테이너.** 사용자별로 상태 격리
- **테스트.** 현재 테스트 스위트는 아직 필요하지 않지만, 향후 통합 테스트 작성이 간단해집니다

---

## Troubleshooting

### `fatal: could not read Password for 'https://…@github.com'`

hub clone 내부의 `git push`와 `git fetch`가 인증을 요구합니다. 글로벌 git 설정을 건드리지 않는 가장 깔끔한 해법은 **로컬** credential helper:

```bash
git -C ~/.claude-handoff/hub config --local credential.helper '!gh auth git-credential'
```

이것은 현재 활성화된 `gh` 계정으로 인증을 위임합니다. 여러 GitHub 계정을 쓴다면 push 전에 `gh auth switch --user <login>`으로 전환하세요.

Helper가 아직 설정되지 않은 첫 clone 시:

```bash
git -c credential.helper='!gh auth git-credential' clone <hub-url> ~/.claude-handoff/hub
```

그 다음 `handoff init --hub <url> --device <name> --skip-clone`을 다시 실행해서 기존 clone을 건드리지 않고 설정만 씁니다.

### Hub visibility가 `UNKNOWN`으로 나옴

- Hub가 GitHub이 아닌 호스트 (GitLab, Bitbucket, self-hosted)에 있거나
- GitHub URL이 잘못되었거나
- `gh` CLI가 없거나 인증되지 않은 경우

`claude-handoff`는 `unknown`을 잠재적 public으로 취급하여 실제 public 레포와 동일한 `yes` 타이핑 확인을 요구합니다. `private` 인식을 복구하려면 GitHub에 호스팅하고 `gh auth login`을 실행하세요.

### 같은 교육 콘텐츠 파일에 대해 스캐너가 계속 prompt함

해당 경로를 `config.json`의 `secretPolicy.allow`에 추가하세요. 다음 push부터 스캐너가 해당 파일을 완전히 건너뜁니다.

### Scope 변경 후 diff/pull에 많은 변경이 나타남

Scope가 넓어짐 → 새 파일이 `added`로 표시됨. Scope가 좁아짐 → 이전에 sync되던 파일이 더 이상 커버되지 않지만, hub 스냅샷이 자동으로 정리되지는 않음. 해당 기기에서 `handoff push`를 실행해서 현재 scope 기준으로 스냅샷을 재작성하세요.

---

## 설계 문서

전체 아키텍처 설명은 [`docs/DESIGN.md`](docs/DESIGN.md)에 있습니다: hub 레이아웃, 버저닝 모델, 토큰화 규칙, scope 의미론, 시크릿 스캐너 플로우, non-goals.

---

## 상태

동작하는 MVP. 최소 한 대의 기기에서 실사용 중. npm 배포는 아직 안 됨.

### 로드맵

- [ ] `handoff log --device <name>` — 기기별 push 히스토리
- [ ] `handoff pull --at <sha>` — 특정 히스토리 버전 복원
- [ ] `handoff init`이 로컬 credential helper를 자동 설정
- [ ] npm publish (`npm install -g claude-handoff`)
- [ ] Claude Code 플러그인 마켓플레이스 등록

---

## 선행 작품

- [`claude-teleport`](https://github.com/anthropics/claude-code-plugins) — 일회성 "내 설정 빔으로 쏘기" 플로우, 기기별 인지 없음
- Dotfile 매니저 (`chezmoi`, `yadm`, `stow`) — 범용이지만 경로 차이는 수동 템플릿링 필요

`claude-handoff`는 Claude Code의 설정 surface에 특화되어 있으며, 어떤 부분이 기기별이고 어떤 부분이 이식 가능한지 내장 인식을 가지고 있습니다. 기본값도 시크릿이 나가지 않도록 설계됐습니다.

---

## 라이선스

MIT
