import type {
  ChangeCategory,
  CommitInfo,
  CommitSummary,
  DevReport,
  ResumeWorkContext,
  UnfinishedTask,
  WorkSession,
} from "./types.js";

const CATEGORY_PATTERNS: Array<{ category: ChangeCategory; patterns: RegExp[] }> = [
  {
    category: "test",
    patterns: [/test/i, /spec/i, /\.test\./, /\.spec\./, /__tests__/],
  },
  {
    category: "docs",
    patterns: [/readme/i, /\.md$/, /doc/i, /comment/i, /documentation/i],
  },
  {
    category: "config",
    patterns: [
      /package\.json/,
      /tsconfig/,
      /\.env/,
      /config/i,
      /settings/i,
      /docker/i,
      /ci/i,
      /\.yaml$/,
      /\.yml$/,
    ],
  },
  {
    category: "bugfix",
    patterns: [
      /fix/i,
      /bug/i,
      /error/i,
      /exception/i,
      /catch/i,
      /retry/i,
      /fallback/i,
      /handle/i,
    ],
  },
  {
    category: "refactor",
    patterns: [/refactor/i, /rename/i, /extract/i, /move/i, /clean/i, /format/i],
  },
  {
    category: "feature",
    patterns: [
      /add/i,
      /implement/i,
      /create/i,
      /new/i,
      /feature/i,
      /api/i,
      /route/i,
      /service/i,
      /component/i,
      /function/i,
    ],
  },
];

export function classifyChange(
  diff: string,
  message: string,
  files: string[]
): ChangeCategory {
  const combined = `${message}\n${diff}\n${files.join("\n")}`;

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) {
      return category;
    }
  }
  return "unknown";
}

export function summarizeCommitFromDiff(
  commit: CommitInfo,
  diff: string
): CommitSummary {
  const changedFiles = commit.files.map((f) => f.path);
  const category = classifyChange(diff, commit.message, changedFiles);
  const technicalDetails = extractTechnicalDetails(diff, changedFiles);
  const summary = buildCommitSummary(commit, category, technicalDetails);
  const possibleUserImpact = inferUserImpact(category, technicalDetails, changedFiles);

  return {
    commitHash: commit.hash,
    date: commit.date,
    changedFiles,
    category,
    summary,
    technicalDetails,
    possibleUserImpact,
  };
}

function extractTechnicalDetails(diff: string, files: string[]): string[] {
  const details: string[] = [];

  const addedFunctions = diff.match(/^\+.*(?:function|def|fn|func|async)\s+(\w+)/gm);
  if (addedFunctions) {
    for (const match of addedFunctions.slice(0, 5)) {
      details.push(`새 함수/메서드 추가: ${match.replace(/^\+\s*/, "").trim()}`);
    }
  }

  const addedClasses = diff.match(/^\+.*(?:class|interface|struct|enum)\s+(\w+)/gm);
  if (addedClasses) {
    for (const match of addedClasses.slice(0, 5)) {
      details.push(`새 타입 정의: ${match.replace(/^\+\s*/, "").trim()}`);
    }
  }

  const routes = diff.match(/^\+.*(?:@app\.|router\.|Route|path\(|get\(|post\(|put\(|delete\()/gm);
  if (routes) {
    for (const match of routes.slice(0, 5)) {
      details.push(`API/라우트 변경: ${match.replace(/^\+\s*/, "").trim()}`);
    }
  }

  const imports = diff.match(/^\+.*(?:import|require|from)\s+.+/gm);
  if (imports && imports.length > 0) {
    details.push(`의존성/import ${imports.length}건 변경`);
  }

  for (const file of files.slice(0, 8)) {
    const fileDiff = extractFileDiff(diff, file);
    if (fileDiff) {
      const added = (fileDiff.match(/^\+[^+]/gm) ?? []).length;
      const removed = (fileDiff.match(/^-[^-]/gm) ?? []).length;
      if (added > 0 || removed > 0) {
        details.push(`${file}: +${added}/-${removed} lines`);
      }
    }
  }

  if (details.length === 0) {
    details.push(`${files.length}개 파일 변경 (${commitStatsHint(files, diff)})`);
  }

  return details.slice(0, 10);
}

function extractFileDiff(diff: string, filePath: string): string | null {
  const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `diff --git a/${escaped} b/${escaped}[\\s\\S]*?(?=\\ndiff --git|$)`
  );
  const match = diff.match(regex);
  return match ? match[0] : null;
}

function commitStatsHint(files: string[], diff: string): string {
  const added = (diff.match(/^\+[^+]/gm) ?? []).length;
  const removed = (diff.match(/^-[^-]/gm) ?? []).length;
  return `+${added}/-${removed} lines across ${files.length} files`;
}

function buildCommitSummary(
  commit: CommitInfo,
  category: ChangeCategory,
  details: string[]
): string {
  const categoryLabel: Record<ChangeCategory, string> = {
    feature: "기능 추가/개선",
    bugfix: "버그 수정/안정화",
    refactor: "리팩터링",
    docs: "문서 변경",
    test: "테스트 변경",
    config: "설정/환경 변경",
    unknown: "코드 변경",
  };

  const fileList = commit.files
    .slice(0, 5)
    .map((f) => f.path.split("/").pop())
    .join(", ");

  const detailHint = details.slice(0, 2).join("; ");
  const msgHint =
    commit.message && !isVagueMessage(commit.message)
      ? ` (커밋 메시지: "${commit.message.split("\n")[0]}")`
      : "";

  return `[${categoryLabel[category]}] ${fileList}${detailHint ? ` — ${detailHint}` : ""}${msgHint}`;
}

function isVagueMessage(message: string): boolean {
  const vague = /^(fix|update|wip|temp|test|change|modify|edit|bug|refactor|chore|misc|\.{1,3})$/i;
  const firstLine = message.split("\n")[0].trim();
  return vague.test(firstLine) || firstLine.length < 4;
}

function inferUserImpact(
  category: ChangeCategory,
  details: string[],
  files: string[]
): string {
  const uiFiles = files.filter((f) =>
    /\.(tsx|jsx|vue|svelte|dart|html|css|scss)$/i.test(f)
  );
  const apiFiles = files.filter((f) =>
    /(api|route|controller|service|handler)/i.test(f)
  );

  if (category === "feature" && uiFiles.length > 0) {
    return "사용자 UI/화면에 새 기능 또는 변경이 반영될 수 있습니다.";
  }
  if (category === "feature" && apiFiles.length > 0) {
    return "백엔드 API 동작이 변경되어 클라이언트 연동에 영향을 줄 수 있습니다.";
  }
  if (category === "bugfix") {
    return "기존 버그/오류가 수정되어 사용자 경험이 개선될 수 있습니다.";
  }
  if (category === "config") {
    return "환경 설정 변경으로 배포/실행 환경에 영향을 줄 수 있습니다.";
  }
  if (category === "refactor") {
    return "내부 구조 변경으로 직접적인 사용자 영향은 적을 수 있습니다.";
  }
  if (details.some((d) => /retry|error|exception|catch/i.test(d))) {
    return "오류 처리/안정성 개선으로 서비스 신뢰성이 향상될 수 있습니다.";
  }
  return "변경 범위에 따라 사용자 또는 개발 워크플로우에 영향을 줄 수 있습니다.";
}

const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

export function groupIntoWorkSessions(commits: CommitInfo[]): WorkSession[] {
  if (commits.length === 0) return [];

  const sorted = [...commits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const sessions: CommitInfo[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date).getTime();
    const curr = new Date(sorted[i].date).getTime();
    if (curr - prev >= SESSION_GAP_MS) {
      sessions.push([sorted[i]]);
    } else {
      sessions[sessions.length - 1].push(sorted[i]);
    }
  }

  return sessions.map((sessionCommits) => {
    const topics = extractTopics(sessionCommits);
    const summary = sessionCommits
      .map((c) => {
        const files = c.files.map((f) => f.path.split("/").pop()).slice(0, 3).join(", ");
        const time = formatTime(c.date);
        return `${time} — ${c.message.split("\n")[0] || "no message"} (${files})`;
      })
      .join("\n");

    return {
      startTime: sessionCommits[0].date,
      endTime: sessionCommits[sessionCommits.length - 1].date,
      commits: sessionCommits,
      summary,
      topics,
    };
  });
}

function extractTopics(commits: CommitInfo[]): string[] {
  const topics = new Set<string>();
  for (const commit of commits) {
    for (const file of commit.files) {
      const parts = file.path.split("/");
      if (parts.length >= 2) {
        topics.add(parts.slice(0, -1).join("/"));
      }
      const name = parts[parts.length - 1].replace(/\.\w+$/, "");
      if (name.length > 2) topics.add(name);
    }
    const msgWords = commit.message.split(/\s+/).filter((w) => w.length > 3);
    for (const word of msgWords.slice(0, 3)) {
      topics.add(word);
    }
  }
  return [...topics].slice(0, 10);
}

function formatTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

export function classifyUnfinishedMatch(
  content: string
): UnfinishedTask["type"] | null {
  if (/TODO/i.test(content)) return "TODO";
  if (/FIXME/i.test(content)) return "FIXME";
  if (/HACK/i.test(content)) return "HACK";
  if (/not implemented|NotImplemented|raise NotImplementedError|throw new Error\(['"]not implemented/i.test(content))
    return "NOT_IMPLEMENTED";
  if (/console\.(log|debug|warn)|print\s*\(|debugger/i.test(content)) return "DEBUG";
  if (/\bpass\b\s*(#|$)|\/\/\s*stub|placeholder/i.test(content)) return "STUB";
  return null;
}

export function buildUnfinishedTask(
  file: string,
  line: number,
  content: string
): UnfinishedTask {
  const type = classifyUnfinishedMatch(content) ?? "TODO";
  const reasons: Record<UnfinishedTask["type"], string> = {
    TODO: "TODO 주석 — 아직 구현되지 않은 작업",
    FIXME: "FIXME 주석 — 수정이 필요한 코드",
    HACK: "HACK 주석 — 임시 해결책",
    NOT_IMPLEMENTED: "미구현 함수/예외 — 기능이 완성되지 않음",
    DEBUG: "디버그 코드 — 프로덕션 전 제거 필요",
    STUB: "스텁/플레이스홀더 — 실제 구현 대기 중",
  };
  return { file, line, type, content, reason: reasons[type] };
}

export function generateDevReportFromCommits(
  commits: CommitInfo[],
  summaries: CommitSummary[],
  unfinishedTasks: UnfinishedTask[],
  since: string,
  until: string,
  format: "daily" | "weekly" | "summary"
): DevReport {
  const features = summaries.filter((s) => s.category === "feature").map((s) => s.summary);
  const bugfixes = summaries.filter((s) => s.category === "bugfix").map((s) => s.summary);
  const refactors = summaries.filter((s) => s.category === "refactor").map((s) => s.summary);

  const remainingTasks = unfinishedTasks.slice(0, 15).map(
    (t) => `${t.file}:${t.line} [${t.type}] ${t.content.slice(0, 80)}`
  );

  const nextSteps = buildNextSteps(summaries, unfinishedTasks);

  const overview =
    commits.length === 0
      ? `${since} ~ ${until} 기간에 커밋이 없습니다.`
      : `${since} ~ ${until} 기간 ${commits.length}개 커밋: 기능 ${features.length}건, 버그수정 ${bugfixes.length}건, 리팩터링 ${refactors.length}건`;

  const reportParagraph = buildReportParagraph(
    since,
    until,
    features,
    bugfixes,
    refactors,
    remainingTasks
  );

  return {
    period: { since, until },
    format,
    overview,
    features,
    bugfixes,
    refactors,
    remainingTasks,
    nextSteps,
    reportParagraph,
    commitCount: commits.length,
    rawCommits: commits,
  };
}

function buildNextSteps(
  summaries: CommitSummary[],
  unfinished: UnfinishedTask[]
): string[] {
  const steps: string[] = [];

  const recentFeatures = summaries.filter((s) => s.category === "feature").slice(0, 3);
  for (const f of recentFeatures) {
    steps.push(`기능 이어하기: ${f.changedFiles.slice(0, 2).join(", ")} 관련 작업 마무리`);
  }

  const fixmes = unfinished.filter((t) => t.type === "FIXME").slice(0, 3);
  for (const t of fixmes) {
    steps.push(`수정 필요: ${t.file}:${t.line}`);
  }

  const todos = unfinished.filter((t) => t.type === "TODO").slice(0, 3);
  for (const t of todos) {
    steps.push(`TODO 처리: ${t.file}:${t.line} — ${t.content.slice(0, 60)}`);
  }

  if (steps.length === 0 && summaries.length > 0) {
    const last = summaries[summaries.length - 1];
    steps.push(`마지막 작업(${last.category}) 이어서 진행: ${last.changedFiles.join(", ")}`);
  }

  return steps.slice(0, 8);
}

function buildReportParagraph(
  since: string,
  until: string,
  features: string[],
  bugfixes: string[],
  refactors: string[],
  remaining: string[]
): string {
  const parts: string[] = [`${since}부터 ${until}까지의 개발 작업 요약.`];

  if (features.length > 0) {
    parts.push(`주요 기능 작업 ${features.length}건을 진행했습니다.`);
  }
  if (bugfixes.length > 0) {
    parts.push(`버그 수정 및 안정화 ${bugfixes.length}건을 처리했습니다.`);
  }
  if (refactors.length > 0) {
    parts.push(`리팩터링 ${refactors.length}건을 수행했습니다.`);
  }
  if (remaining.length > 0) {
    parts.push(`미완성 작업 ${remaining.length}건이 남아 있습니다.`);
  }
  if (features.length === 0 && bugfixes.length === 0 && refactors.length === 0) {
    parts.push("해당 기간의 주요 변경 사항을 분석 중입니다.");
  }

  return parts.join(" ");
}

export function buildResumeContext(
  lastCommit: CommitInfo | null,
  recentFiles: string[],
  unfinishedTasks: UnfinishedTask[],
  lastSummary: CommitSummary | null
): ResumeWorkContext {
  const lastWorkSummary = lastSummary
    ? lastSummary.summary
    : lastCommit
      ? `[${lastCommit.shortHash}] ${lastCommit.message.split("\n")[0]} — ${lastCommit.files.map((f) => f.path).slice(0, 3).join(", ")}`
      : "최근 커밋 기록이 없습니다.";

  const nextRecommendedTasks: string[] = [];

  for (const task of unfinishedTasks.slice(0, 5)) {
    nextRecommendedTasks.push(`${task.file}:${task.line} [${task.type}] ${task.content.slice(0, 70)}`);
  }

  if (lastSummary && lastSummary.category === "feature") {
    nextRecommendedTasks.push(
      `마지막 기능 작업 이어하기: ${lastSummary.changedFiles.slice(0, 2).join(", ")}`
    );
  }

  if (nextRecommendedTasks.length === 0 && lastCommit) {
    nextRecommendedTasks.push(
      `마지막 커밋(${lastCommit.shortHash}) 관련 파일 검토 후 다음 작업 계획`
    );
  }

  return {
    lastCommit,
    lastActivity: lastCommit?.date ?? "없음",
    relatedFiles: recentFiles.slice(0, 15),
    unfinishedTasks: unfinishedTasks.slice(0, 20),
    lastWorkSummary,
    nextRecommendedTasks: nextRecommendedTasks.slice(0, 8),
  };
}

export function formatWorkSessionDiary(
  date: string,
  sessions: WorkSession[]
): string {
  if (sessions.length === 0) {
    return `${date} — 해당 날짜에 커밋 기록이 없습니다.`;
  }

  const lines: string[] = [`# ${date} 작업 일지`, ""];

  sessions.forEach((session, idx) => {
    lines.push(
      `## 세션 ${idx + 1} (${formatTime(session.startTime)} ~ ${formatTime(session.endTime)})`
    );
    lines.push(`- 커밋 ${session.commits.length}건`);
    if (session.topics.length > 0) {
      lines.push(`- 주제: ${session.topics.slice(0, 6).join(", ")}`);
    }
    lines.push("");
    lines.push(session.summary);
    lines.push("");
  });

  return lines.join("\n");
}

export function getDefaultSince(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}
