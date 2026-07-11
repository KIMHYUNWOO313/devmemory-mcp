import {
  generateDevReportFromCommits,
  getDefaultSince,
  getToday,
  summarizeCommitFromDiff,
} from "../analyzer.js";
import { getCommitDiff, getCommitTimeline } from "../git.js";
import { handleFindUnfinishedTasks } from "./findUnfinishedTasks.js";

export const generateDevReportSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 경로" },
  since: { type: "string" as const, description: "보고서 시작일 (YYYY-MM-DD)" },
  until: { type: "string" as const, description: "보고서 종료일 (기본 오늘)" },
  format: {
    type: "string" as const,
    enum: ["daily", "weekly", "summary"],
    description: "보고서 형식 (daily | weekly | summary)",
  },
};

export async function handleGenerateDevReport(args: {
  repoPath: string;
  since: string;
  until?: string;
  format?: "daily" | "weekly" | "summary";
}) {
  const until = args.until ?? getToday();
  const format = args.format ?? "summary";

  const commits = await getCommitTimeline(args.repoPath, {
    since: args.since,
    until: until + " 23:59:59",
    maxCount: 100,
  });

  const summaries = [];
  for (const commit of commits.slice(0, 30)) {
    try {
      const { diff } = await getCommitDiff(args.repoPath, commit.hash);
      summaries.push(summarizeCommitFromDiff(commit, diff));
    } catch {
      summaries.push(summarizeCommitFromDiff(commit, ""));
    }
  }

  const unfinishedResult = await handleFindUnfinishedTasks({
    repoPath: args.repoPath,
    since: args.since,
  });

  const report = generateDevReportFromCommits(
    commits,
    summaries,
    unfinishedResult.tasks,
    args.since,
    until,
    format
  );

  return {
    ...report,
    hint: "LLM: reportParagraph를 기반으로 팀 보고용 자연어 개발 보고서를 작성하세요.",
  };
}
