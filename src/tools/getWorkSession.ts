import { formatWorkSessionDiary, groupIntoWorkSessions } from "../analyzer.js";
import { getCommitsForDate } from "../git.js";

export const getWorkSessionSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 경로" },
  date: { type: "string" as const, description: "조회 날짜 (YYYY-MM-DD)" },
};

export async function handleGetWorkSession(args: {
  repoPath: string;
  date: string;
}) {
  const commits = await getCommitsForDate(args.repoPath, args.date);
  const sessions = groupIntoWorkSessions(commits);
  const diary = formatWorkSessionDiary(args.date, sessions);

  return {
    date: args.date,
    commitCount: commits.length,
    sessionCount: sessions.length,
    sessions: sessions.map((s) => ({
      startTime: s.startTime,
      endTime: s.endTime,
      commitCount: s.commits.length,
      topics: s.topics,
      commits: s.commits.map((c) => ({
        hash: c.shortHash,
        time: c.date,
        message: c.message.split("\n")[0],
        files: c.files.map((f) => f.path),
      })),
    })),
    diary,
    hint: "LLM: diary와 sessions를 바탕으로 '어제/오늘 무엇을 했는지' 자연어 작업 일지를 작성하세요.",
  };
}
