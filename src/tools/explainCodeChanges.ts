import {
  explainCodeChangesFromDiff,
  formatCodeExplanationNaturalLanguage,
  type CodeChangeExplanation,
} from "../codeExplainer.js";
import { getCommitDiff, getCommitTimeline, getCommitsForDate } from "../git.js";
import { resolveRepoSource, withRepoMeta, type RepoSourceInput } from "../repoResolver.js";

export async function handleExplainCodeChanges(
  args: RepoSourceInput & {
    commitHash?: string;
    date?: string;
    filePath?: string;
    since?: string;
    maxCommits?: number;
  }
) {
  const repo = await resolveRepoSource(args);
  const explanations = [];

  if (args.commitHash) {
    const { diff, commit } = await getCommitDiff(repo.repoPath, args.commitHash);
    const explanation = explainCodeChangesFromDiff(diff, {
      commitHash: commit.hash,
      date: commit.date,
    });
    explanations.push({
      commitHash: commit.shortHash,
      date: commit.date,
      message: commit.message.split("\n")[0],
      ...explanation,
    });
  } else if (args.date) {
    const commits = await getCommitsForDate(repo.repoPath, args.date);
    for (const commit of commits) {
      const { diff } = await getCommitDiff(repo.repoPath, commit.hash);
      let explanation = explainCodeChangesFromDiff(diff, {
        commitHash: commit.hash,
        date: commit.date,
      });
      if (args.filePath) {
        explanation = filterByFile(explanation, args.filePath);
      }
      explanations.push({
        commitHash: commit.shortHash,
        date: commit.date,
        message: commit.message.split("\n")[0],
        ...explanation,
      });
    }
  } else {
    const commits = await getCommitTimeline(repo.repoPath, {
      since: args.since ?? "7 days ago",
      maxCount: args.maxCommits ?? 10,
    });
    for (const commit of commits) {
      if (args.filePath && !commit.files.some((f) => f.path.includes(args.filePath!))) {
        continue;
      }
      const { diff } = await getCommitDiff(repo.repoPath, commit.hash);
      let explanation = explainCodeChangesFromDiff(diff, {
        commitHash: commit.hash,
        date: commit.date,
      });
      if (args.filePath) {
        explanation = filterByFile(explanation, args.filePath);
      }
      if (explanation.files.length === 0) continue;
      explanations.push({
        commitHash: commit.shortHash,
        date: commit.date,
        message: commit.message.split("\n")[0],
        ...explanation,
      });
    }
  }

  const combinedNarrative = explanations
    .map((e) => `### 커밋 ${e.commitHash} (${e.date})\n${e.narrative}`)
    .join("\n\n");

  const naturalLanguage = explanations
    .map((e) => formatCodeExplanationNaturalLanguage(e))
    .join("\n---\n");

  return withRepoMeta(
    {
      explanationCount: explanations.length,
      explanations,
      combinedNarrative,
      naturalLanguageReport: naturalLanguage,
      hint:
        "LLM: naturalLanguageReport를 바탕으로 '어떤 파일의 어떤 함수/부분이 무슨 기능인지' 사용자에게 설명하세요.",
    },
    repo
  );
}

function filterByFile(
  explanation: CodeChangeExplanation,
  filePath: string
): CodeChangeExplanation {
  const files = explanation.files.filter(
    (f: { file: string }) => f.file.includes(filePath) || filePath.includes(f.file)
  );
  return {
    ...explanation,
    files,
    narrative: files.map((f) => f.fileSummary).join("; ") || explanation.narrative,
  };
}
