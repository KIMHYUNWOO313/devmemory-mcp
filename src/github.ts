import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";

const GITHUB_URL_PATTERN =
  /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

const SHALLOW_DEPTH = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  path: string;
  clonedAt: number;
}

const cloneCache = new Map<string, CacheEntry>();

export function parseGitHubUrl(url: string): { owner: string; repo: string; cloneUrl: string } {
  const trimmed = url.trim();
  const match = trimmed.match(GITHUB_URL_PATTERN);
  if (!match) {
    throw new Error(
      `지원하지 않는 GitHub URL입니다: ${url}\n예: https://github.com/facebook/react`
    );
  }
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export async function clonePublicGitHubRepo(repoUrl: string): Promise<string> {
  const { owner, repo, cloneUrl } = parseGitHubUrl(repoUrl);
  const cacheKey = `${owner}/${repo}`.toLowerCase();

  const cached = cloneCache.get(cacheKey);
  if (cached && existsSync(cached.path) && Date.now() - cached.clonedAt < CACHE_TTL_MS) {
    return cached.path;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "devmemory-"));
  const git = simpleGit();

  try {
    await git.clone(cloneUrl, tempDir, [
      "--depth",
      String(SHALLOW_DEPTH),
      "--single-branch",
    ]);
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|404|Repository not found/i.test(message)) {
      throw new Error(
        `Public GitHub 저장소를 찾을 수 없습니다: ${owner}/${repo}\n` +
          "저장소가 public인지, URL이 맞는지 확인하세요. (private repo는 지원하지 않습니다)"
      );
    }
    if (/authentication|403|permission/i.test(message)) {
      throw new Error(
        `저장소 접근이 거부되었습니다: ${owner}/${repo}\n` +
          "private 저장소는 지원하지 않습니다. public repo URL을 사용하세요."
      );
    }
    throw new Error(`GitHub clone 실패: ${message}`);
  }

  cloneCache.set(cacheKey, { path: tempDir, clonedAt: Date.now() });
  return tempDir;
}

export function clearCloneCache(): void {
  for (const entry of cloneCache.values()) {
    if (existsSync(entry.path)) {
      rmSync(entry.path, { recursive: true, force: true });
    }
  }
  cloneCache.clear();
}
