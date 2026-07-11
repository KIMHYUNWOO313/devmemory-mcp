import { buildUnfinishedTask } from "../analyzer.js";
import { getRecentChangedFiles, searchInWorkingTree } from "../git.js";
import { getDefaultSince } from "../analyzer.js";

const UNFINISHED_PATTERN =
  /TODO|FIXME|HACK|not implemented|NotImplemented|raise NotImplementedError|throw new Error\(['"]not implemented|console\.(log|debug)|\bdebugger\b|\bprint\s*\(|\/\/\s*stub|#\s*stub|placeholder/i;

export const findUnfinishedTasksSchema = {
  repoPath: { type: "string" as const, description: "Git 저장소 경로" },
  since: { type: "string" as const, description: "최근 변경 파일 필터 시작일 (기본 14일 전)" },
};

export async function handleFindUnfinishedTasks(args: {
  repoPath: string;
  since?: string;
}) {
  const since = args.since ?? getDefaultSince(14);
  const recentFiles = await getRecentChangedFiles(args.repoPath, since, 30);

  const allMatches = await searchInWorkingTree(args.repoPath, UNFINISHED_PATTERN);
  const recentSet = new Set(recentFiles);

  const prioritized = allMatches.sort((a, b) => {
    const aRecent = recentSet.has(a.file) ? 0 : 1;
    const bRecent = recentSet.has(b.file) ? 0 : 1;
    return aRecent - bRecent;
  });

  const tasks = prioritized
    .map((m) => buildUnfinishedTask(m.file, m.line, m.content))
    .slice(0, 50);

  const byType = tasks.reduce(
    (acc, t) => {
      acc[t.type] = (acc[t.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    since,
    totalFound: tasks.length,
    byType,
    recentChangedFiles: recentFiles.slice(0, 20),
    tasks,
    hint: "LLM: recentChangedFiles에 있는 미완성 작업을 우선 설명하고, 남은 작업 목록을 정리하세요.",
  };
}
