import { buildResumeContext, summarizeCommitFromDiff } from "../analyzer.js";
import {
  getCommitDiff,
  getLatestCommit,
  getRecentChangedFiles,
} from "../git.js";
import { handleFindUnfinishedTasks } from "./findUnfinishedTasks.js";

export const resumeLastWorkSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 경로" },
};

export async function handleResumeLastWork(args: { repoPath: string }) {
  const lastCommit = await getLatestCommit(args.repoPath);
  const recentFiles = await getRecentChangedFiles(args.repoPath, undefined, 15);

  const unfinishedResult = await handleFindUnfinishedTasks({
    repoPath: args.repoPath,
    since: undefined,
  });

  let lastSummary = null;
  if (lastCommit) {
    try {
      const { diff } = await getCommitDiff(args.repoPath, lastCommit.hash);
      lastSummary = summarizeCommitFromDiff(lastCommit, diff);
    } catch {
      lastSummary = summarizeCommitFromDiff(lastCommit, "");
    }
  }

  const context = buildResumeContext(
    lastCommit,
    recentFiles,
    unfinishedResult.tasks,
    lastSummary
  );

  return {
    ...context,
    lastCommitSummary: lastSummary,
    hint: "LLM: 개발자가 프로젝트를 다시 열었을 때 '마지막 작업 맥락'과 '다음 추천 작업'을 친절하게 안내하세요.",
  };
}
