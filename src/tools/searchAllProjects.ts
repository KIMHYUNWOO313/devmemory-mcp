import { formatWorkSessionDiary, groupIntoWorkSessions } from "../analyzer.js";
import { getCommitTimeline, getCommitsForDate } from "../git.js";
import {
  resolveProjectList,
  type ProjectDefinition,
} from "../projects.js";
import { resolveRepoSource } from "../repoResolver.js";
import type { ProjectCommit } from "../types.js";
import { handleFindUnfinishedTasks } from "./findUnfinishedTasks.js";
import { handleResumeLastWork } from "./resumeLastWork.js";

export type SearchAllMode = "timeline" | "daily" | "unfinished" | "overview";

export interface SearchAllProjectsInput {
  mode?: SearchAllMode;
  projects?: ProjectDefinition[];
  projectNames?: string[];
  since?: string;
  until?: string;
  date?: string;
  authorEmail?: string;
  authorName?: string;
  maxCountPerProject?: number;
}

interface ProjectRunResult<T> {
  projectName: string;
  projectLabel: string;
  success: boolean;
  error?: string;
  data?: T;
}

async function runPerProject<T>(
  projectList: ProjectDefinition[],
  fn: (project: ProjectDefinition, repoPath: string, label: string) => Promise<T>
): Promise<ProjectRunResult<T>[]> {
  const results: ProjectRunResult<T>[] = [];

  for (const project of projectList) {
    try {
      const repo = await resolveRepoSource({
        repoPath: project.repoPath,
        repoUrl: project.repoUrl,
      });
      const data = await fn(project, repo.repoPath, repo.repoLabel);
      results.push({
        projectName: project.name,
        projectLabel: repo.repoLabel,
        success: true,
        data,
      });
    } catch (err) {
      results.push({
        projectName: project.name,
        projectLabel: project.repoPath ?? project.repoUrl ?? project.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

function tagCommits(
  commits: Awaited<ReturnType<typeof getCommitTimeline>>,
  projectName: string,
  projectLabel: string
): ProjectCommit[] {
  return commits.map((c) => ({
    ...c,
    projectName,
    projectLabel,
  }));
}

function buildMergedTimeline(
  results: ProjectRunResult<Awaited<ReturnType<typeof getCommitTimeline>>>[]
) {
  const merged: ProjectCommit[] = [];
  for (const r of results) {
    if (r.success && r.data) {
      merged.push(...tagCommits(r.data, r.projectName, r.projectLabel));
    }
  }
  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return merged;
}

function buildTimelineByProject(merged: ProjectCommit[]) {
  const byProject: Record<string, number> = {};
  for (const c of merged) {
    byProject[c.projectName] = (byProject[c.projectName] ?? 0) + 1;
  }
  return byProject;
}

export async function handleSearchAllProjects(args: SearchAllProjectsInput) {
  const mode = args.mode ?? "timeline";
  const projectList = resolveProjectList({
    projects: args.projects,
    projectNames: args.projectNames,
  });

  const timelineOpts = {
    since: args.since,
    until: args.until,
    maxCount: args.maxCountPerProject ?? 30,
    authorEmail: args.authorEmail,
    authorName: args.authorName,
  };

  if (mode === "timeline") {
    const results = await runPerProject(projectList, async (_p, repoPath) =>
      getCommitTimeline(repoPath, timelineOpts)
    );
    const merged = buildMergedTimeline(results);

    return {
      mode,
      projectCount: projectList.length,
      successCount: results.filter((r) => r.success).length,
      totalCommits: merged.length,
      commitsByProject: buildTimelineByProject(merged),
      commits: merged.map((c) => ({
        projectName: c.projectName,
        projectLabel: c.projectLabel,
        hash: c.shortHash,
        author: c.author,
        email: c.email,
        date: c.date,
        message: c.message.split("\n")[0],
        files: c.files.map((f) => f.path).slice(0, 8),
        fileCount: c.files.length,
      })),
      projectResults: results.map(({ projectName, projectLabel, success, error }) => ({
        projectName,
        projectLabel,
        success,
        error,
      })),
      hint: "LLM: commits를 시간순으로 프로젝트별 작업 흐름을 자연어로 요약하세요.",
    };
  }

  if (mode === "daily") {
    const date = args.date;
    if (!date) {
      throw new Error('mode="daily"일 때 date (YYYY-MM-DD)가 필요합니다.');
    }

    const results = await runPerProject(projectList, async (_p, repoPath) => {
      const commits = await getCommitsForDate(repoPath, date);
      const filtered = commits.filter((c) => {
        if (!args.authorEmail && !args.authorName) return true;
        if (args.authorEmail && c.email.toLowerCase().includes(args.authorEmail.toLowerCase()))
          return true;
        if (args.authorName && c.author.toLowerCase().includes(args.authorName.toLowerCase()))
          return true;
        return false;
      });
      const sessions = groupIntoWorkSessions(filtered);
      return {
        commits: filtered,
        sessions,
        diary: formatWorkSessionDiary(date, sessions),
      };
    });

    const allCommits: ProjectCommit[] = [];
    const diaries: string[] = [];

    for (const r of results) {
      if (r.success && r.data) {
        allCommits.push(...tagCommits(r.data.commits, r.projectName, r.projectLabel));
        if (r.data.commits.length > 0) {
          diaries.push(`## ${r.projectName}\n${r.data.diary}`);
        }
      }
    }

    allCommits.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      mode,
      date,
      projectCount: projectList.length,
      totalCommits: allCommits.length,
      commits: allCommits.map((c) => ({
        projectName: c.projectName,
        time: c.date,
        message: c.message.split("\n")[0],
        files: c.files.map((f) => f.path).slice(0, 5),
      })),
      combinedDiary: diaries.join("\n\n") || `${date} — 모든 프로젝트에서 커밋 없음`,
      projectResults: results.map((r) => ({
        projectName: r.projectName,
        success: r.success,
        commitCount: r.data?.commits.length ?? 0,
        error: r.error,
      })),
      hint: "LLM: combinedDiary와 commits로 '오늘/어제 전체 프로젝트에서 뭘 했는지' 요약하세요.",
    };
  }

  if (mode === "unfinished") {
    const results = await runPerProject(projectList, async (project) =>
      handleFindUnfinishedTasks({
        repoPath: project.repoPath,
        repoUrl: project.repoUrl,
        since: args.since,
      })
    );

    const allTasks = results.flatMap((r) =>
      r.success && r.data
        ? r.data.tasks.map((t) => ({ ...t, projectName: r.projectName }))
        : []
    );

    return {
      mode,
      projectCount: projectList.length,
      totalTasks: allTasks.length,
      tasks: allTasks.slice(0, 80),
      projectResults: results.map((r) => ({
        projectName: r.projectName,
        success: r.success,
        taskCount: r.data?.totalFound ?? 0,
        error: r.error,
      })),
      hint: "LLM: 프로젝트별 미완성 작업을 정리하고 우선순위를 제안하세요.",
    };
  }

  if (mode === "overview") {
    const results = await runPerProject(projectList, async (project, repoPath) => {
      const resume = await handleResumeLastWork({
        repoPath: project.repoPath,
        repoUrl: project.repoUrl,
      });
      const recent = await getCommitTimeline(repoPath, {
        since: args.since ?? "14 days ago",
        maxCount: 5,
        authorEmail: args.authorEmail,
        authorName: args.authorName,
      });
      return { resume, recentCommitCount: recent.length, recentCommits: recent };
    });

    return {
      mode,
      projectCount: projectList.length,
      projects: results.map((r) => ({
        projectName: r.projectName,
        projectLabel: r.projectLabel,
        success: r.success,
        error: r.error,
        lastWorkSummary: r.data?.resume.lastWorkSummary,
        lastActivity: r.data?.resume.lastActivity,
        recentCommitCount: r.data?.recentCommitCount ?? 0,
        recentCommits: (r.data?.recentCommits ?? []).map((c) => ({
          hash: c.shortHash,
          date: c.date,
          message: c.message.split("\n")[0],
        })),
        nextTasks: r.data?.resume.nextRecommendedTasks.slice(0, 3),
      })),
      hint: "LLM: 각 프로젝트별 최근 작업 현황과 다음 할 일을 한눈에 요약하세요.",
    };
  }

  throw new Error(`지원하지 않는 mode: ${mode}`);
}
