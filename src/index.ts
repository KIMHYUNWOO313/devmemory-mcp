#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleFindUnfinishedTasks } from "./tools/findUnfinishedTasks.js";
import { handleGenerateDevReport } from "./tools/generateDevReport.js";
import { handleGetCommitTimeline } from "./tools/getCommitTimeline.js";
import { handleGetWorkSession } from "./tools/getWorkSession.js";
import { handleResumeLastWork } from "./tools/resumeLastWork.js";
import { handleSummarizeCommit } from "./tools/summarizeCommit.js";

const SERVER_NAME = "devmemory-mcp";
const SERVER_VERSION = "1.0.0";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

async function safeCall<T>(fn: () => Promise<T>) {
  try {
    const result = await fn();
    return jsonResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(message);
  }
}

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

server.registerTool(
  "get_commit_timeline",
  {
    description:
      "지정된 Git 저장소에서 커밋 목록을 시간순으로 가져옵니다. hash, author, date, message, changed files를 반환합니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 절대 또는 상대 경로"),
      since: z.string().optional().describe("시작 날짜 (예: 2025-07-01, 7 days ago)"),
      until: z.string().optional().describe("종료 날짜 (예: 2025-07-11)"),
      maxCount: z.number().optional().describe("최대 커밋 수 (기본 50)"),
    },
  },
  async (args) => safeCall(() => handleGetCommitTimeline(args))
);

server.registerTool(
  "summarize_commit",
  {
    description:
      "특정 커밋의 diff를 분석해 기능/버그수정/리팩터링 등으로 분류하고 요약합니다. 커밋 메시지에 의존하지 않습니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 경로"),
      commitHash: z.string().describe("분석할 커밋 해시"),
    },
  },
  async (args) => safeCall(() => handleSummarizeCommit(args))
);

server.registerTool(
  "get_work_session",
  {
    description:
      "특정 날짜의 커밋을 시간대별 작업 세션으로 묶어 일간 작업일지 형태로 반환합니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 경로"),
      date: z.string().describe("조회 날짜 (YYYY-MM-DD)"),
    },
  },
  async (args) => safeCall(() => handleGetWorkSession(args))
);

server.registerTool(
  "find_unfinished_tasks",
  {
    description:
      "TODO, FIXME, HACK, 미구현 코드, 디버그 코드 등 미완성 작업을 저장소에서 탐지합니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 경로"),
      since: z.string().optional().describe("최근 변경 파일 필터 시작일"),
    },
  },
  async (args) => safeCall(() => handleFindUnfinishedTasks(args))
);

server.registerTool(
  "generate_dev_report",
  {
    description:
      "기간 내 커밋과 diff를 분석해 일간/주간/요약 개발 보고서를 생성합니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 경로"),
      since: z.string().describe("보고서 시작일 (YYYY-MM-DD)"),
      until: z.string().optional().describe("보고서 종료일 (기본 오늘)"),
      format: z
        .enum(["daily", "weekly", "summary"])
        .optional()
        .describe("보고서 형식"),
    },
  },
  async (args) => safeCall(() => handleGenerateDevReport(args))
);

server.registerTool(
  "resume_last_work",
  {
    description:
      "최근 커밋, 변경 파일, TODO/FIXME를 분석해 마지막 작업 맥락과 다음 추천 작업을 반환합니다.",
    inputSchema: {
      repoPath: z.string().describe("Git 저장소 경로"),
    },
  },
  async (args) => safeCall(() => handleResumeLastWork(args))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
