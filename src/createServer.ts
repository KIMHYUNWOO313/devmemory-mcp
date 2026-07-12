import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { handleExplainCodeChanges } from "./tools/explainCodeChanges.js";
import { handleFindUnfinishedTasks } from "./tools/findUnfinishedTasks.js";
import { handleGenerateDevReport } from "./tools/generateDevReport.js";
import { handleGetCommitTimeline } from "./tools/getCommitTimeline.js";
import { handleGetWorkSession } from "./tools/getWorkSession.js";
import { handleListProjects } from "./tools/listProjects.js";
import { handleResumeLastWork } from "./tools/resumeLastWork.js";
import { handleSearchAllProjects } from "./tools/searchAllProjects.js";
import { handleSummarizeCommit } from "./tools/summarizeCommit.js";

export const SERVER_NAME = "devmemory-mcp";
export const SERVER_VERSION = "1.0.0";

/** PlayMCP 심사 필수: annotations 5개 모두 지정 */
function toolAnnotations(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true,
  };
}

const repoUrlSchema = z
  .string()
  .optional()
  .describe(
    "Public GitHub 저장소 URL (예: https://github.com/facebook/react). AWS/PlayMCP 배포 시 사용. 로그인 불필요."
  );

const repoPathSchema = z
  .string()
  .optional()
  .describe("로컬 Git 저장소 경로. Cursor 로컬 개발 시 사용.");

const projectEntrySchema = z.object({
  name: z.string().describe("프로젝트 별칭 (예: summet, backend)"),
  repoPath: z.string().optional().describe("로컬 Git 경로"),
  repoUrl: z.string().optional().describe("Public GitHub URL"),
});

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

export function createDevMemoryServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_projects",
    {
      description:
        "Returns registered Git projects for DevMemory(데브메모리). Reads devmemory.projects.json or DEVMEMORY_PROJECTS env.",
      inputSchema: {},
      annotations: toolAnnotations("List Projects"),
    },
    async () => safeCall(() => handleListProjects())
  );

  server.registerTool(
    "search_all_projects",
    {
      description:
        "Searches multiple Git projects at once via DevMemory(데브메모리). Modes: timeline, daily, unfinished, overview.",
      inputSchema: {
        mode: z
          .enum(["timeline", "daily", "unfinished", "overview"])
          .optional()
          .describe("검색 모드 (기본: timeline)"),
        projects: z
          .array(projectEntrySchema)
          .optional()
          .describe("검색할 프로젝트 목록 (미지정 시 등록된 프로젝트 전체)"),
        projectNames: z
          .array(z.string())
          .optional()
          .describe("등록된 프로젝트 중 특정 이름만 필터 (예: [\"summet\", \"backend\"])"),
        since: z.string().optional().describe("시작 날짜"),
        until: z.string().optional().describe("종료 날짜"),
        date: z.string().optional().describe('daily 모드용 날짜 (YYYY-MM-DD)'),
        authorEmail: z.string().optional().describe("커밋 author email 필터"),
        authorName: z.string().optional().describe("커밋 author name 필터"),
        maxCountPerProject: z.number().optional().describe("프로젝트당 최대 커밋 수"),
      },
      annotations: toolAnnotations("Search All Projects"),
    },
    async (args) => safeCall(() => handleSearchAllProjects(args))
  );

  server.registerTool(
    "get_commit_timeline",
    {
      description:
        "Fetches commit timeline from a local repo or public GitHub URL via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        since: z.string().optional().describe("시작 날짜 (예: 2025-07-01, 7 days ago)"),
        until: z.string().optional().describe("종료 날짜"),
        maxCount: z.number().optional().describe("최대 커밋 수 (기본 50)"),
        authorEmail: z.string().optional().describe("author email 필터"),
        authorName: z.string().optional().describe("author name 필터"),
      },
      annotations: toolAnnotations("Get Commit Timeline"),
    },
    async (args) => safeCall(() => handleGetCommitTimeline(args))
  );

  server.registerTool(
    "explain_code_changes",
    {
      description:
        "Explains which file, function, and lines changed and their purpose via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        commitHash: z.string().optional().describe("특정 커밋 분석"),
        date: z.string().optional().describe("특정 날짜의 모든 커밋 분석 (YYYY-MM-DD)"),
        filePath: z.string().optional().describe("특정 파일만 필터 (예: payment_service.py)"),
        since: z.string().optional().describe("기간 필터 (commitHash/date 없을 때)"),
        maxCommits: z.number().optional().describe("분석할 최대 커밋 수"),
      },
      annotations: toolAnnotations("Explain Code Changes"),
    },
    async (args) => safeCall(() => handleExplainCodeChanges(args))
  );

  server.registerTool(
    "summarize_commit",
    {
      description:
        "Analyzes commit diff and returns feature classification via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        commitHash: z.string().describe("분석할 커밋 해시"),
      },
      annotations: toolAnnotations("Summarize Commit"),
    },
    async (args) => safeCall(() => handleSummarizeCommit(args))
  );

  server.registerTool(
    "get_work_session",
    {
      description:
        "Groups commits on a given date into work sessions via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        date: z.string().describe("조회 날짜 (YYYY-MM-DD)"),
      },
      annotations: toolAnnotations("Get Work Session"),
    },
    async (args) => safeCall(() => handleGetWorkSession(args))
  );

  server.registerTool(
    "find_unfinished_tasks",
    {
      description:
        "Detects TODO, FIXME, and unimplemented markers via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        since: z.string().optional().describe("최근 변경 파일 필터 시작일"),
      },
      annotations: toolAnnotations("Find Unfinished Tasks"),
    },
    async (args) => safeCall(() => handleFindUnfinishedTasks(args))
  );

  server.registerTool(
    "generate_dev_report",
    {
      description:
        "Generates a daily/weekly dev report from commits and diffs via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
        since: z.string().describe("보고서 시작일 (YYYY-MM-DD)"),
        until: z.string().optional().describe("보고서 종료일"),
        format: z.enum(["daily", "weekly", "summary"]).optional(),
      },
      annotations: toolAnnotations("Generate Dev Report"),
    },
    async (args) => safeCall(() => handleGenerateDevReport(args))
  );

  server.registerTool(
    "resume_last_work",
    {
      description:
        "Restores last work context and suggests next steps via DevMemory(데브메모리).",
      inputSchema: {
        repoUrl: repoUrlSchema,
        repoPath: repoPathSchema,
      },
      annotations: toolAnnotations("Resume Last Work"),
    },
    async (args) => safeCall(() => handleResumeLastWork(args))
  );

  return server;
}
