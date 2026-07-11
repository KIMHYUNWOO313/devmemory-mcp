import { getCommitTimeline } from "../git.js";

export const getCommitTimelineSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 절대 또는 상대 경로" },
  since: { type: "string" as const, description: "시작 날짜 (예: 2025-07-01, 7 days ago)" },
  until: { type: "string" as const, description: "종료 날짜 (예: 2025-07-11)" },
  maxCount: { type: "number" as const, description: "최대 커밋 수 (기본 50)" },
};

export async function handleGetCommitTimeline(args: {
  repoPath: string;
  since?: string;
  until?: string;
  maxCount?: number;
}) {
  const commits = await getCommitTimeline(args.repoPath, {
    since: args.since,
    until: args.until,
    maxCount: args.maxCount,
  });

  return {
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
  };
}
