import { buildResumeContext, summarizeCommitFromDiff } from "../analyzer.js";
import {
  getCommitDiff,
  getLatestCommit,
  getRecentChangedFiles,
} from "../git.js";
import { resolveRepoSource, withRepoMeta, type RepoSourceInput } from "../repoResolver.js";
import { handleFindUnfinishedTasks } from "./findUnfinishedTasks.js";

export async function handleResumeLastWork(args: RepoSourceInput) {
  const repo = await resolveRepoSource(args);
  const lastCommit = await getLatestCommit(repo.repoPath);
  const recentFiles = await getRecentChangedFiles(repo.repoPath, undefined, 15);

  const unfinishedResult = await handleFindUnfinishedTasks({
    repoUrl: repo.repoUrl,
    repoPath: repo.source === "local" ? repo.repoPath : undefined,
  });

  let lastSummary = null;
  if (lastCommit) {
    try {
      const { diff } = await getCommitDiff(repo.repoPath, lastCommit.hash);
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

  return withRepoMeta(
    {
      ...context,
      lastCommitSummary: lastSummary,
      hint: "LLM: 개발자가 프로젝트를 다시 열었을 때 '마지막 작업 맥락'과 '다음 추천 작업'을 친절하게 안내하세요.",
    },
    repo
  );
}
