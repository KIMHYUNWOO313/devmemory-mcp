import { resolveRepoPath } from "./git.js";
import { clonePublicGitHubRepo } from "./github.js";

export interface RepoSourceInput {
  repoUrl?: string;
  repoPath?: string;
}

export interface ResolvedRepo {
  repoPath: string;
  source: "local" | "github";
  repoUrl?: string;
  repoLabel: string;
}

export async function resolveRepoSource(input: RepoSourceInput): Promise<ResolvedRepo> {
  if (input.repoUrl && input.repoPath) {
    throw new Error("repoUrl과 repoPath 중 하나만 지정하세요.");
  }
  if (!input.repoUrl && !input.repoPath) {
    throw new Error(
      "repoUrl(공개 GitHub URL) 또는 repoPath(로컬 경로) 중 하나가 필요합니다.\n" +
        "예: repoUrl=https://github.com/facebook/react"
    );
  }

  if (input.repoUrl) {
    const repoPath = await clonePublicGitHubRepo(input.repoUrl);
    const label = input.repoUrl.replace(/^https?:\/\/(?:www\.)?github\.com\//, "");
    return {
      repoPath,
      source: "github",
      repoUrl: input.repoUrl,
      repoLabel: label,
    };
  }

  const repoPath = resolveRepoPath(input.repoPath!);
  return {
    repoPath,
    source: "local",
    repoLabel: repoPath,
  };
}

export function withRepoMeta<T extends Record<string, unknown>>(
  result: T,
  repo: ResolvedRepo
): T & { repo: { source: string; label: string; url?: string } } {
  return {
    ...result,
    repo: {
      source: repo.source,
      label: repo.repoLabel,
      ...(repo.repoUrl ? { url: repo.repoUrl } : {}),
    },
  };
}
