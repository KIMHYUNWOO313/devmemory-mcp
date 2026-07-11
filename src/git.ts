import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit, SimpleGit, LogResult } from "simple-git";
import type { CommitInfo, FileChange } from "./types.js";

const MAX_DIFF_CHARS = 50_000;

export function validateRepoPath(repoPath: string): string {
  const absolute = resolve(repoPath);
  if (!existsSync(absolute)) {
    throw new Error(`저장소 경로가 존재하지 않습니다: ${absolute}`);
  }
  const gitDir = resolve(absolute, ".git");
  if (!existsSync(gitDir)) {
    throw new Error(`Git 저장소가 아닙니다: ${absolute}`);
  }
  return absolute;
}

export function createGit(repoPath: string): SimpleGit {
  const absolute = validateRepoPath(repoPath);
  return simpleGit({ baseDir: absolute });
}

export async function getCommitTimeline(
  repoPath: string,
  options: { since?: string; until?: string; maxCount?: number } = {}
): Promise<CommitInfo[]> {
  const git = createGit(repoPath);
  const maxCount = options.maxCount ?? 50;

  const logOptions: Record<string, unknown> = {
    "--numstat": null,
    "--date": "iso-strict",
    maxCount,
  };
  if (options.since) logOptions["--since"] = options.since;
  if (options.until) logOptions["--until"] = options.until;

  const log: LogResult = await git.log(logOptions);
  return log.all.map(parseLogEntry);
}

export async function getCommitsForDate(
  repoPath: string,
  date: string
): Promise<CommitInfo[]> {
  const git = createGit(repoPath);
  const log = await git.log({
    "--numstat": null,
    "--date": "iso-strict",
    "--since": `${date} 00:00:00`,
    "--until": `${date} 23:59:59`,
  });
  return log.all.map(parseLogEntry);
}

export async function getCommitDiff(
  repoPath: string,
  commitHash: string
): Promise<{ diff: string; commit: CommitInfo }> {
  const git = createGit(repoPath);
  const show = await git.show([commitHash, "--format=fuller", "--stat", "-p"]);
  const log = await git.log({ maxCount: 1, from: commitHash, to: commitHash, "--numstat": null, "--date": "iso-strict" });
  const commit = log.latest ? parseLogEntry(log.latest) : {
    hash: commitHash,
    shortHash: commitHash.slice(0, 7),
    author: "unknown",
    email: "",
    date: new Date().toISOString(),
    message: "",
    files: [],
  };
  return { diff: truncateDiff(show), commit };
}

export async function getRecentChangedFiles(
  repoPath: string,
  since?: string,
  maxCount = 20
): Promise<string[]> {
  const commits = await getCommitTimeline(repoPath, { since, maxCount });
  const files = new Set<string>();
  for (const commit of commits) {
    for (const file of commit.files) {
      files.add(file.path);
    }
  }
  return [...files];
}

export async function getLatestCommit(repoPath: string): Promise<CommitInfo | null> {
  const commits = await getCommitTimeline(repoPath, { maxCount: 1 });
  return commits[0] ?? null;
}

function toLineCount(value: string | number | undefined): number {
  if (value === undefined || value === "-") return 0;
  return Number(value) || 0;
}

function parseLogEntry(entry: LogResult["all"][number]): CommitInfo {
  const files: FileChange[] = (entry.diff?.files ?? []).map((f) => {
    if ("insertions" in f && "deletions" in f) {
      return {
        path: f.file,
        insertions: toLineCount(f.insertions as string | number | undefined),
        deletions: toLineCount(f.deletions as string | number | undefined),
      };
    }
    return { path: f.file, insertions: 0, deletions: 0 };
  });

  return {
    hash: entry.hash,
    shortHash: entry.hash.slice(0, 7),
    author: entry.author_name,
    email: entry.author_email,
    date: entry.date,
    message: entry.message,
    files,
  };
}

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return (
    diff.slice(0, MAX_DIFF_CHARS) +
    `\n\n... [diff truncated: ${diff.length - MAX_DIFF_CHARS} more characters] ...`
  );
}

export async function searchInWorkingTree(
  repoPath: string,
  pattern: RegExp,
  filePaths?: string[]
): Promise<Array<{ file: string; line: number; content: string }>> {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join, relative } = await import("node:path");
  const absolute = validateRepoPath(repoPath);
  const results: Array<{ file: string; line: number; content: string }> = [];

  const ignoreDirs = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "coverage",
  ]);

  const textExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".dart", ".go", ".rs",
    ".java", ".kt", ".swift", ".md", ".json", ".yaml", ".yml",
    ".html", ".css", ".scss", ".vue", ".svelte", ".rb", ".php",
    ".cs", ".cpp", ".c", ".h", ".sql", ".sh", ".toml",
  ]);

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!ignoreDirs.has(entry)) walk(full);
      } else if (stat.isFile()) {
        const rel = relative(absolute, full).replace(/\\/g, "/");
        if (filePaths && !filePaths.some((p) => rel.includes(p) || p.includes(rel))) {
          continue;
        }
        const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
        if (!textExtensions.has(ext)) continue;
        try {
          const content = readFileSync(full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              results.push({ file: rel, line: i + 1, content: lines[i].trim() });
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(absolute);
  return results;
}
