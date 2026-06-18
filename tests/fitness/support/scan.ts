// Matching helpers shared by the fitness source-scan checks (issue #692).
//
// Kept separate from `source-globber.ts` (filesystem walking) so the two
// concerns stay small and independently testable. Everything here is pure.

import type { SourceFile } from "./source-globber";

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
