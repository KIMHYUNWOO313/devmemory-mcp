# DevMemory MCP

Git 커밋과 코드 변경 이력을 MCP로 분석해, 개발자가 **언제 어떤 기능을 만들었고 무엇이 남았는지** 자동으로 기억해주는 개발 작업 메모리 서버입니다.

> Jira는 계획과 협업 관리에 강하지만, 실제 코드 변경 맥락을 자동으로 이해하지는 못합니다.  
> DevMemory MCP는 Git diff와 코드 변경 흐름을 분석해 **Jira에 기록되지 않은 실제 개발 과정**을 자동으로 복원합니다.

## 기능 (MCP Tools)

| Tool | 설명 |
|------|------|
| `get_commit_timeline` | 기간별 커밋 타임라인 |
| `summarize_commit` | diff 기반 커밋 요약 (커밋 메시지 무관) |
| `get_work_session` | 하루 단위 작업 세션 / 작업일지 |
| `find_unfinished_tasks` | TODO/FIXME/미구현 코드 탐지 |
| `generate_dev_report` | 일간/주간 개발 보고서 |
| `resume_last_work` | 마지막 작업 맥락 + 다음 할 일 추천 |
| `list_projects` | 등록된 프로젝트 목록 |
| `search_all_projects` | **여러 프로젝트 한 번에 검색** |

## 여러 프로젝트 한 번에 검색

### 프로젝트 등록 — `devmemory.projects.json`

```json
{
  "projects": [
    { "name": "summet", "repoPath": "C:/Users/user/summet" },
    { "name": "backend", "repoPath": "C:/Users/user/my-backend" }
  ]
}
```

Cursor MCP `env`로도 가능: `DEVMEMORY_PROJECTS=summet=C:/path,backend=C:/path2`

### `search_all_projects` 모드

| mode | 설명 |
|------|------|
| `timeline` | 모든 프로젝트 커밋 시간순 통합 |
| `daily` | 특정 날짜 전 프로젝트 작업일지 |
| `unfinished` | 전 프로젝트 TODO/FIXME |
| `overview` | 프로젝트별 최근 현황 |

### 질문 예시

```
등록된 모든 프로젝트에서 어제 내 작업 search_all_projects daily로 알려줘
```

```
summet, backend만 projectNames로 지난 7일 timeline 검색해줘
```

## 설치

```bash
cd git_report
npm install
npm run build
```

## Public GitHub URL (AWS / PlayMCP 배포용)

**GitHub 로그인은 필요 없습니다.** public 저장소는 서버가 직접 clone합니다.

모든 tool에 `repoUrl` 파라미터 사용:

```
repoUrl: https://github.com/facebook/react
```

PlayMCP/ChatGPT에서 자연어 질문 예:

```
https://github.com/facebook/react 저장소 지난 7일 커밋 타임라인 분석해줘
```

AI가 `get_commit_timeline` tool을 `repoUrl`과 함께 호출합니다. **사용자 GitHub 로그인 불필요.**

| 대상 | 필요한 로그인 |
|------|--------------|
| PlayMCP에서 질문 | **카카오 계정** (PlayMCP 로그인) |
| Public GitHub repo 분석 | **없음** |
| Private GitHub repo | 지원 안 함 |

## AWS 배포 (PlayMCP 등록용)

PlayMCP는 **HTTP Endpoint URL**이 필요합니다 (`/mcp`).

```bash
npm run build
docker build -t devmemory-mcp .
docker run -p 8080:8080 devmemory-mcp
# Health: http://localhost:8080/health
# MCP:    http://localhost:8080/mcp
```

AWS ECS/EC2/App Runner에 배포 후 HTTPS URL을 PlayMCP 콘솔에 등록:

1. https://playmcp.kakao.com/console 접속 (카카오 로그인)
2. 새 MCP 서버 등록 → Endpoint: `https://your-aws-domain.com/mcp`
3. 임시 등록으로 PlayMCP 웹에서 테스트
4. 완료 후 등록 및 심사 요청 → 전체 공개 → 공모전 응모

> 공모전 FAQ: 예선은 카카오 클라우드 MCP Endpoint 권장. AWS도 HTTP MCP 서버면 등록 가능하나, 공모전 페이지에서 카카오클라oud Endpoint 요건을 확인하세요.

## Cursor MCP 설정 (로컬 개발)

Cursor Settings → MCP → `mcp.json`에 추가:

```json
{
  "mcpServers": {
    "devmemory": {
      "command": "node",
      "args": [
        "C:/Users/user/kakao_ai/git_report/dist/index.js"
      ]
    }
  }
}
```

개발 중에는 `tsx`로도 실행 가능:

```json
{
  "mcpServers": {
    "devmemory": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/Users/user/kakao_ai/git_report/src/index.ts"
      ],
      "cwd": "C:/Users/user/kakao_ai/git_report"
    }
  }
}
```

## 사용 예시 (Cursor에서 질문)

```
이 저장소에서 어제 내가 어떤 작업을 했는지 DevMemory MCP로 분석해줘.
```

```
지난 7일 동안 커밋을 분석해서 주간 개발 보고서를 만들어줘.
repoPath는 C:/Users/user/myproject 야.
```

```
최근 커밋을 보고 내가 마지막으로 작업하던 기능과 다음에 해야 할 일을 알려줘.
```

```
최근 변경된 파일 중 미완성 작업이나 TODO가 있는지 찾아줘.
```

```
이 커밋(abc1234)이 실제로 어떤 기능을 수정한 건지 diff 기반으로 요약해줘.
```

## 프로젝트 구조

```
git_report/
├── src/
│   ├── index.ts          # MCP 서버 진입점
│   ├── git.ts            # Git 명령 래퍼
│   ├── analyzer.ts       # diff 분석 / 분류 / 보고서 생성
│   ├── types.ts
│   └── tools/
│       ├── getCommitTimeline.ts
│       ├── summarizeCommit.ts
│       ├── getWorkSession.ts
│       ├── findUnfinishedTasks.ts
│       ├── generateDevReport.ts
│       └── resumeLastWork.ts
├── package.json
└── tsconfig.json
```

## PlayMCP 공모전 제출용 한 줄 소개

**DevMemory MCP**는 Cursor와 Git 저장소를 연결해 개발자의 코드 변경 흐름을 자동 기록·분석하고, 작업 타임라인, 기능별 변경 요약, 미완성 작업, 주간 보고서를 생성하는 **개발자용 AI 작업 기억 도구**입니다.

## 라이선스

MIT
