// Matching helpers shared by the fitness source-scan checks (issue #692).
//
// Kept separate from `source-globber.ts` (filesystem walking) so the two
// concerns stay small and independently testable. Everything here is pure.

import type { SourceFile } from "./source-globber";

/** Apply a text transform (e.g. comment stripping) to each file's contents. */
export function stripFiles(
  files: readonly SourceFile[],
  transform: (text: string) => string
): SourceFile[] {
  return files.map((f) => ({ ...f, text: transform(f.text) }));
}

/** One regex hit inside a file, with a 1-based line number for the report. */
export interface LineMatch {
  readonly relPath: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Scan each file line-by-line for `pattern` and return every hit. `pattern` is
 * applied per line (no `g`/`m` state to manage), so callers pass a simple regex.
 */
export function scanLines(
  files: readonly SourceFile[],
  pattern: RegExp
): LineMatch[] {
  const hits: LineMatch[] = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((text, i) => {
      if (pattern.test(text)) {
        hits.push({ relPath: file.relPath, line: i + 1, text: text.trim() });
      }
    });
  }
  return hits;
}

/** Render matches as a readable, copy-pasteable block for assertion messages. */
export function formatMatches(matches: readonly LineMatch[]): string {
  return matches.map((m) => `  ${m.relPath}:${m.line}  ${m.text}`).join("\n");
}

/**
 * Strip SQL comments (`-- …` to EOL and `/* … *\/` blocks) to spaces, so a scan
 * of migration text matches real DDL/policy code, not an illustrative literal in
 * a comment. Preserves newlines so line numbers from the raw text still align.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  type Mode = "code" | "line" | "block";
  let mode: Mode = "code";

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (mode === "code") {
      if (c === "-" && next === "-") {
        mode = "line";
        i += 2;
      } else if (c === "/" && next === "*") {
        mode = "block";
        i += 2;
      } else {
        out += c;
        i += 1;
      }
    } else if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += "\n";
      }
      i += 1;
    } else {
      // block
      if (c === "*" && next === "/") {
        mode = "code";
        i += 2;
      } else {
        if (c === "\n") out += "\n";
        i += 1;
      }
    }
  }
  return out;
}

/**
 * Blank single-quoted SQL string literals to spaces (handling the `''` escape),
 * so a string's contents (a jsonb KEY like `'has_admin_summary'`, a label, or a
 * `'select …'`/`'delete from …'` built for dynamic SQL) can't masquerade as real
 * code. Newlines are preserved so line numbers still align.
 */
export function stripSqlStrings(sql: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!inString) {
      if (c === "'") {
        inString = true;
        out += " ";
      } else {
        out += c;
      }
    } else if (c === "'" && sql[i + 1] === "'") {
      out += "  ";
      i++;
    } else if (c === "'") {
      inString = false;
      out += " ";
    } else {
      out += c === "\n" ? "\n" : " ";
    }
  }
  return out;
}

/**
 * Slice every `insert into public.audit_events …;` statement, balanced to the
 * statement-terminating `;` at paren-depth 0 (so a sibling `insert into members`
 * in the same RPC body is excluded). Comments and strings are stripped first, so
 * a commented example or a string literal mentioning `audit_events` never counts.
 */
export function auditInsertBlocks(sqlText: string): string[] {
  const text = stripSqlStrings(stripSqlComments(sqlText));
  const lower = text.toLowerCase();
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = lower.indexOf("insert into public.audit_events", from);
    if (start === -1) break;
    let depth = 0;
    let end = text.length;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth <= 0) {
        end = i;
        break;
      }
    }
    blocks.push(text.slice(start, end));
    from = start + 1;
  }
  return blocks;
}

/** True when `sqlText` contains at least one `audit_events` insert. */
export function writesAudit(sqlText: string): boolean {
  return auditInsertBlocks(sqlText).length > 0;
}

// Path fragments for files that are NOT app/runtime code: colocated tests and
// fixtures legitimately reference forbidden tokens (e.g. asserting a migration
// does NOT grant to `service_role`, or fixture UUID/email literals), so the
// runtime invariant scans exclude them.
export const TEST_FILE_EXCLUDES = [
  "/__tests__/",
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
] as const;
