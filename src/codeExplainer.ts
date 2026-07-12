export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "route"
  | "component"
  | "block";

export type ChangeAction = "added" | "modified" | "removed";

export interface CodePartChange {
  file: string;
  symbolKind: SymbolKind;
  symbolName: string;
  action: ChangeAction;
  startLine?: number;
  endLine?: number;
  addedLines: number;
  removedLines: number;
  codeSnippet: string;
  purpose: string;
}

export interface FileCodeExplanation {
  file: string;
  parts: CodePartChange[];
  fileSummary: string;
}

export interface CodeChangeExplanation {
  commitHash?: string;
  date?: string;
  files: FileCodeExplanation[];
  narrative: string;
}

interface DiffHunk {
  file: string;
  oldStart: number;
  newStart: number;
  lines: Array<{ type: "+" | "-" | " "; content: string; oldLine?: number; newLine?: number }>;
}

const SYMBOL_PATTERNS: Array<{ kind: SymbolKind; regex: RegExp; group: number }> = [
  { kind: "function", regex: /^\+\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, group: 1 },
  { kind: "function", regex: /^\+\s*def\s+(\w+)\s*\(/, group: 1 },
  { kind: "method", regex: /^\+\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::|{|=>\s*{)/, group: 1 },
  { kind: "class", regex: /^\+\s*(?:export\s+)?class\s+(\w+)/, group: 1 },
  { kind: "interface", regex: /^\+\s*(?:export\s+)?interface\s+(\w+)/, group: 1 },
  { kind: "route", regex: /^\+\s*@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/, group: 2 },
  { kind: "route", regex: /^\+\s*(?:router|Route)\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/, group: 2 },
  { kind: "component", regex: /^\+\s*(?:export\s+)?(?:const|function)\s+(\w+)\s*[=:].*(?:React|FC|Component)/, group: 1 },
];

const SKIP_SYMBOLS = new Set(["if", "for", "while", "switch", "catch", "return", "import", "from", "const", "let", "var"]);

export function explainCodeChangesFromDiff(
  diff: string,
  meta?: { commitHash?: string; date?: string }
): CodeChangeExplanation {
  const hunks = parseDiffToHunks(diff);
  const byFile = new Map<string, DiffHunk[]>();

  for (const h of hunks) {
    const list = byFile.get(h.file) ?? [];
    list.push(h);
    byFile.set(h.file, list);
  }

  const files: FileCodeExplanation[] = [];

  for (const [file, fileHunks] of byFile) {
    const parts = extractPartsFromHunks(file, fileHunks);
    files.push({
      file,
      parts,
      fileSummary: buildFileSummary(file, parts),
    });
  }

  return {
    commitHash: meta?.commitHash,
    date: meta?.date,
    files,
    narrative: buildNarrative(files),
  };
}

function parseDiffToHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split("\n");
  let currentFile = "";
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[2];
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch && currentFile) {
      if (current) hunks.push(current);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      current = { file: currentFile, oldStart: oldLine, newStart: newLine, lines: [] };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ type: "+", content: line.slice(1), newLine });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ type: "-", content: line.slice(1), oldLine });
      oldLine++;
    } else if (line.startsWith(" ")) {
      current.lines.push({ type: " ", content: line.slice(1), oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

function extractPartsFromHunks(file: string, hunks: DiffHunk[]): CodePartChange[] {
  const parts: CodePartChange[] = [];
  const seen = new Set<string>();

  for (const hunk of hunks) {
    const added = hunk.lines.filter((l) => l.type === "+").map((l) => l.content);
    const removed = hunk.lines.filter((l) => l.type === "-").map((l) => l.content);
    const addedText = added.join("\n");
    const removedText = removed.join("\n");

    // 명시적 심볼 탐지
    for (const line of hunk.lines) {
      if (line.type !== "+") continue;
      const fullLine = `+${line.content}`;

      for (const pat of SYMBOL_PATTERNS) {
        const m = fullLine.match(pat.regex);
        if (!m) continue;
        const name = m[pat.group] ?? m[1];
        if (!name || SKIP_SYMBOLS.has(name) || seen.has(name)) continue;
        seen.add(name);

        const snippet = collectSymbolSnippet(hunk.lines, hunk.lines.indexOf(line));
        const action: ChangeAction = removedText.includes(name) ? "modified" : "added";

        parts.push({
          file,
          symbolKind: pat.kind,
          symbolName: name,
          action,
          startLine: line.newLine,
          endLine: line.newLine ? line.newLine + snippet.split("\n").length - 1 : undefined,
          addedLines: added.length,
          removedLines: removed.length,
          codeSnippet: snippet.slice(0, 600),
          purpose: inferPurpose(name, snippet, file, action),
        });
        break;
      }
    }

    // 심볼 없으면 파일 블록 단위
    if (parts.length === 0 && (added.length > 0 || removed.length > 0)) {
      const label = inferBlockLabel(addedText || removedText, file);
      const key = `${file}:${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        const action: ChangeAction =
          added.length > 0 && removed.length > 0 ? "modified" : added.length > 0 ? "added" : "removed";
        parts.push({
          file,
          symbolKind: "block",
          symbolName: label,
          action,
          startLine: hunk.newStart,
          addedLines: added.length,
          removedLines: removed.length,
          codeSnippet: (addedText || removedText).slice(0, 600),
          purpose: inferPurpose(label, addedText || removedText, file, action),
        });
      }
    }
  }

  return parts;
}

function collectSymbolSnippet(
  lines: DiffHunk["lines"],
  startIdx: number
): string {
  const start = lines[startIdx];
  if (!start) return "";

  const out: string[] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 12); i++) {
    const l = lines[i];
    if (i > startIdx && l.type === " ") break;
    if (l.type === "+") out.push(l.content);
    else if (i > startIdx) break;
  }
  return out.join("\n") || start.content;
}

function inferBlockLabel(code: string, file: string): string {
  const base = file.split("/").pop()?.replace(/\.\w+$/, "") ?? file;
  if (/import|require/.test(code)) return `${base} imports`;
  if (/TODO|FIXME/.test(code)) return `${base} pending work`;
  return `${base} logic block`;
}

export function inferPurpose(
  name: string,
  code: string,
  file: string,
  action: ChangeAction
): string {
  const ctx = `${name} ${code} ${file}`.toLowerCase();
  const actionLabel =
    action === "added" ? "새로 추가됨" : action === "modified" ? "기존 코드 수정됨" : "제거됨";

  const rules: Array<[RegExp, string]> = [
    [/login|signin|sign_in|auth|firebase/, "사용자 로그인/인증 처리"],
    [/logout|signout|sign_out/, "로그아웃 처리"],
    [/token|refresh|jwt|session/, "인증 토큰/세션 관리"],
    [/payment|stripe|checkout|billing|subscription|invoice/, "결제/구독/청구 처리"],
    [/webhook/, "외부 결제/서비스 webhook 이벤트 처리"],
    [/summar|meeting|stt|transcript/, "회의/음성 텍스트 요약 처리"],
    [/firestore|database|db|persist|save.*status/, "데이터 저장/상태 persistence"],
    [/retry|fallback|error|exception|catch/, "오류 처리 및 재시도/안정화"],
    [/api|route|endpoint|controller|handler/, "API 엔드포인트/요청 처리"],
    [/ui|component|screen|page|widget|render/, "UI 화면/컴포넌트"],
    [/test|spec|mock|assert/, "테스트 코드"],
    [/config|env|setting/, "설정/환경 구성"],
    [/oauth|provider/, "OAuth/외부 인증 연동"],
  ];

  for (const [pattern, desc] of rules) {
    if (pattern.test(ctx)) {
      return `${desc} (${actionLabel})`;
    }
  }

  if (action === "added") return `'${name}' 기능/로직 추가`;
  if (action === "modified") return `'${name}' 내부 로직 변경`;
  return `'${name}' 코드 제거`;
}

function buildFileSummary(file: string, parts: CodePartChange[]): string {
  if (parts.length === 0) return `${file}: 변경 내용 분석 중`;
  const names = parts.map((p) => p.symbolName).slice(0, 4).join(", ");
  return `${file} — ${parts.length}개 영역 변경 (${names})`;
}

function buildNarrative(files: FileCodeExplanation[]): string {
  if (files.length === 0) return "분석할 코드 변경이 없습니다.";

  const lines: string[] = [];
  for (const f of files) {
    lines.push(`📄 ${f.file}`);
    for (const p of f.parts) {
      const loc = p.startLine ? ` (L${p.startLine}${p.endLine && p.endLine !== p.startLine ? `-${p.endLine}` : ""})` : "";
      lines.push(`  • [${p.action}] ${p.symbolKind} \`${p.symbolName}\`${loc}`);
      lines.push(`    기능: ${p.purpose}`);
    }
  }
  return lines.join("\n");
}

export function formatCodeExplanationNaturalLanguage(explanation: CodeChangeExplanation): string {
  const lines = ["## 코드 변경 상세 설명\n"];

  for (const f of explanation.files) {
    lines.push(`### ${f.file}`);
    lines.push(f.fileSummary);
    lines.push("");

    for (const p of f.parts) {
      const loc = p.startLine ? `**${p.startLine}~${p.endLine ?? p.startLine}행**` : "";
      lines.push(`#### \`${p.symbolName}\` (${p.symbolKind}) ${loc}`);
      lines.push(`- **변경:** ${p.action} (+${p.addedLines}/-${p.removedLines} lines)`);
      lines.push(`- **역할:** ${p.purpose}`);
      if (p.codeSnippet) {
        lines.push("```");
        lines.push(p.codeSnippet.slice(0, 400));
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
