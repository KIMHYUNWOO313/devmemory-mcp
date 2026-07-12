import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface ProjectDefinition {
  name: string;
  repoPath?: string;
  repoUrl?: string;
}

const CONFIG_FILENAME = "devmemory.projects.json";

function normalizeProject(raw: ProjectDefinition): ProjectDefinition {
  const name = raw.name?.trim();
  if (!name) throw new Error("프로젝트 name이 필요합니다.");

  const repoPath = raw.repoPath?.trim();
  const repoUrl = raw.repoUrl?.trim();

  if (repoPath && repoUrl) {
    throw new Error(`프로젝트 "${name}": repoPath와 repoUrl 중 하나만 지정하세요.`);
  }
  if (!repoPath && !repoUrl) {
    throw new Error(`프로젝트 "${name}": repoPath 또는 repoUrl이 필요합니다.`);
  }

  return { name, ...(repoPath ? { repoPath } : {}), ...(repoUrl ? { repoUrl } : {}) };
}

function parseEnvProjects(): ProjectDefinition[] {
  const raw = process.env.DEVMEMORY_PROJECTS?.trim();
  if (!raw) return [];

  return raw.split(",").map((entry) => {
    const trimmed = entry.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      throw new Error(
        `DEVMEMORY_PROJECTS 형식 오류: "${trimmed}"\n예: summet=C:/projects/summet,backend=C:/projects/backend`
      );
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return normalizeProject({ name, repoUrl: value });
    }
    return normalizeProject({ name, repoPath: value });
  });
}

function loadConfigFile(path: string): ProjectDefinition[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
    projects?: ProjectDefinition[];
  };
  if (!Array.isArray(parsed.projects)) {
    throw new Error(`${path}: "projects" 배열이 필요합니다.`);
  }
  return parsed.projects.map(normalizeProject);
}

export function getConfigFilePaths(): string[] {
  const paths: string[] = [];
  if (process.env.DEVMEMORY_CONFIG) {
    paths.push(resolve(process.env.DEVMEMORY_CONFIG));
  }
  paths.push(resolve(process.cwd(), CONFIG_FILENAME));
  paths.push(join(homedir(), ".devmemory", CONFIG_FILENAME));
  return paths;
}

export function getRegisteredProjects(): ProjectDefinition[] {
  const fromEnv = parseEnvProjects();
  if (fromEnv.length > 0) return fromEnv;

  for (const path of getConfigFilePaths()) {
    const fromFile = loadConfigFile(path);
    if (fromFile.length > 0) return fromFile;
  }

  return [];
}

export function resolveProjectList(input: {
  projects?: ProjectDefinition[];
  projectNames?: string[];
}): ProjectDefinition[] {
  let list: ProjectDefinition[];

  if (input.projects && input.projects.length > 0) {
    list = input.projects.map(normalizeProject);
  } else {
    list = getRegisteredProjects();
    if (list.length === 0) {
      throw new Error(
        "등록된 프로젝트가 없습니다.\n" +
          "방법 1) tool 호출 시 projects 배열 전달\n" +
          "방법 2) devmemory.projects.json 파일 생성\n" +
          '방법 3) 환경변수 DEVMEMORY_PROJECTS="summet=C:/path,backend=C:/path2"'
      );
    }
  }

  if (input.projectNames && input.projectNames.length > 0) {
    const names = new Set(input.projectNames.map((n) => n.toLowerCase()));
    list = list.filter((p) => names.has(p.name.toLowerCase()));
    if (list.length === 0) {
      throw new Error(`일치하는 프로젝트 없음: ${input.projectNames.join(", ")}`);
    }
  }

  return list;
}
