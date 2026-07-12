import { getCommitTimeline } from "../git.js";
import { resolveRepoSource, withRepoMeta, type RepoSourceInput } from "../repoResolver.js";

export async function handleGetCommitTimeline(
  args: RepoSourceInput & {
    since?: string;
    until?: string;
    maxCount?: number;
    authorEmail?: string;
    authorName?: string;
  }
) {
  const repo = await resolveRepoSource(args);
  const commits = await getCommitTimeline(repo.repoPath, {
    since: args.since,
    until: args.until,
    maxCount: args.maxCount,
    authorEmail: args.authorEmail,
    authorName: args.authorName,
  });

  return withRepoMeta(
    {
      count: commits.length,
      commits: commits.map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash,
        author: c.author,
        date: c.date,
        message: c.message,
        files: c.files,
        totalInsertions: c.files.reduce((s, f) => s + f.insertions, 0),
        totalDeletions: c.files.reduce((s, f) => s + f.deletions, 0),
      })),
      hint: "LLM: 각 커밋의 files와 message를 참고해 시간순 작업 흐름을 자연어로 요약하세요.",
    },
    repo
  );
}
