import {
  generateDevReportFromCommits,
  getDefaultSince,
  getToday,
  summarizeCommitFromDiff,
} from "../analyzer.js";
import { getCommitDiff, getCommitTimeline } from "../git.js";
import { resolveRepoSource, withRepoMeta, type RepoSourceInput } from "../repoResolver.js";
import { handleFindUnfinishedTasks } from "./findUnfinishedTasks.js";

export async function handleGenerateDevReport(
  args: RepoSourceInput & {
    since: string;
    until?: string;
    format?: "daily" | "weekly" | "summary";
  }
) {
  const repo = await resolveRepoSource(args);
  const until = args.until ?? getToday();
  const format = args.format ?? "summary";

  const commits = await getCommitTimeline(repo.repoPath, {
    since: args.since,
    until: until + " 23:59:59",
    maxCount: 100,
  });

  const summaries = [];
  for (const commit of commits.slice(0, 30)) {
    try {
      const { diff } = await getCommitDiff(repo.repoPath, commit.hash);
      summaries.push(summarizeCommitFromDiff(commit, diff));
    } catch {
      summaries.push(summarizeCommitFromDiff(commit, ""));
    }
  }

  const unfinishedResult = await handleFindUnfinishedTasks({
    repoUrl: repo.repoUrl,
    repoPath: repo.source === "local" ? repo.repoPath : undefined,
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

  return withRepoMeta(
    {
      ...report,
      hint: "LLM: reportParagraph를 기반으로 팀 보고용 자연어 개발 보고서를 작성하세요.",
    },
    repo
  );
}
