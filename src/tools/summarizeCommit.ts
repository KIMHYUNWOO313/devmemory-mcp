import { summarizeCommitFromDiff } from "../analyzer.js";
import { getCommitDiff } from "../git.js";

export const summarizeCommitSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 경로" },
  commitHash: { type: "string" as const, description: "분석할 커밋 해시 (전체 또는 short hash)" },
};

export async function handleSummarizeCommit(args: {
  repoPath: string;
  commitHash: string;
}) {
  const { diff, commit } = await getCommitDiff(args.repoPath, args.commitHash);
  const summary = summarizeCommitFromDiff(commit, diff);

  return {
    ...summary,
    commitMessage: commit.message,
    diffPreview: diff.slice(0, 8000),
    hint: "LLM: diffPreview와 technicalDetails를 참고해 커밋 메시지와 무관하게 실제 변경 내용을 자연어로 설명하세요.",
  };
}
