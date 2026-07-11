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

## 설치

```bash
cd git_report
npm install
npm run build
```

## Cursor MCP 설정

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
