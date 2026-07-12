import { explainCodeChangesFromDiff } from "../codeExplainer.js";
import { summarizeCommitFromDiff } from "../analyzer.js";
import { getCommitDiff } from "../git.js";
import { resolveRepoSource, withRepoMeta, type RepoSourceInput } from "../repoResolver.js";

export async function handleSummarizeCommit(
  args: RepoSourceInput & { commitHash: string }
) {
  const repo = await resolveRepoSource(args);
  const { diff, commit } = await getCommitDiff(repo.repoPath, args.commitHash);
  const summary = summarizeCommitFromDiff(commit, diff);
  const codeExplanation = explainCodeChangesFromDiff(diff, {
    commitHash: commit.hash,
    date: commit.date,
  });

  return withRepoMeta(
    {
      ...summary,
      commitMessage: commit.message,
      codeExplanation,
      naturalLanguageReport: codeExplanation.narrative,
      diffPreview: diff.slice(0, 8000),
      hint: "LLM: codeExplanation.files[].parts[]에 파일/함수/역할(purpose)이 있습니다. 이를 자연어로 풀어 설명하세요.",
    },
    repo
  );
}
