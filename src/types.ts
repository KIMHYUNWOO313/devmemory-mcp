export type ChangeCategory =
  | "feature"
  | "bugfix"
  | "refactor"
  | "docs"
  | "test"
  | "config"
  | "unknown";

export interface FileChange {
  path: string;
  insertions: number;
  deletions: number;
  status?: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  files: FileChange[];
}

export interface CommitSummary {
  commitHash: string;
  date: string;
  changedFiles: string[];
  category: ChangeCategory;
  summary: string;
  technicalDetails: string[];
  possibleUserImpact: string;
}

export interface WorkSession {
  startTime: string;
  endTime: string;
  commits: CommitInfo[];
  summary: string;
  topics: string[];
}

export interface UnfinishedTask {
  file: string;
  line: number;
  type: "TODO" | "FIXME" | "HACK" | "NOT_IMPLEMENTED" | "DEBUG" | "STUB";
  content: string;
  reason: string;
}

export interface DevReport {
  period: { since: string; until: string };
  format: "daily" | "weekly" | "summary";
  overview: string;
  features: string[];
  bugfixes: string[];
  refactors: string[];
  remainingTasks: string[];
  nextSteps: string[];
  reportParagraph: string;
  commitCount: number;
  rawCommits: CommitInfo[];
}

export interface ResumeWorkContext {
  lastCommit: CommitInfo | null;
  lastActivity: string;
  relatedFiles: string[];
  unfinishedTasks: UnfinishedTask[];
  lastWorkSummary: string;
  nextRecommendedTasks: string[];
}

export interface ProjectCommit extends CommitInfo {
  projectName: string;
  projectLabel: string;
}

export interface ProjectSearchResult {
  projectName: string;
  projectLabel: string;
  success: boolean;
  error?: string;
}
