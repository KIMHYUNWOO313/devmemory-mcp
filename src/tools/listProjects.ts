import { getConfigFilePaths, getRegisteredProjects } from "../projects.js";

export async function handleListProjects() {
  const projects = getRegisteredProjects();
  const configPaths = getConfigFilePaths();

  return {
    count: projects.length,
    projects: projects.map((p) => ({
      name: p.name,
      repoPath: p.repoPath,
      repoUrl: p.repoUrl,
    })),
    configSearchPaths: configPaths,
    envConfigured: Boolean(process.env.DEVMEMORY_PROJECTS),
    hint:
      projects.length === 0
        ? "devmemory.projects.json 또는 DEVMEMORY_PROJECTS 환경변수로 프로젝트를 등록하세요."
        : "LLM: search_all_projects에서 projectNames로 특정 프로젝트만 필터할 수 있습니다.",
  };
}
