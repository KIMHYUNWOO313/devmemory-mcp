/**
 * DevMemory MCP 로컬 동작 테스트 스크립트
 * MCP 서버 없이 tool handler를 직접 호출합니다.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGetCommitTimeline } from "./src/tools/getCommitTimeline.js";
import { handleFindUnfinishedTasks } from "./src/tools/findUnfinishedTasks.js";
import { handleResumeLastWork } from "./src/tools/resumeLastWork.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = resolve(__dirname);

async function main() {
  console.log("=== DevMemory MCP 로컬 테스트 ===");
  console.log("repoPath:", repoPath);
  console.log("");

  console.log("1) get_commit_timeline");
  const timeline = await handleGetCommitTimeline({ repoPath, maxCount: 10 });
  console.log(JSON.stringify(timeline, null, 2));
  console.log("");

  console.log("2) find_unfinished_tasks");
  const tasks = await handleFindUnfinishedTasks({ repoPath });
  console.log(`미완성 작업 ${tasks.totalFound}건`);
  console.log(JSON.stringify(tasks.tasks.slice(0, 5), null, 2));
  console.log("");

  console.log("3) resume_last_work");
  const resume = await handleResumeLastWork({ repoPath });
  console.log(JSON.stringify(resume, null, 2));
}

main().catch((err) => {
  console.error("테스트 실패:", err.message);
  process.exit(1);
});
