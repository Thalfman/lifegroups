import { describe, expect, it } from "vitest";

import {
  readSourceFiles,
  stripComments,
  type SourceFile,
} from "./support/source-globber";
import { stripFiles, TEST_FILE_EXCLUDES } from "./support/scan";

// P0 invariant: every table read uses explicit column allowlists, never the
// all-columns form. PostgREST's `select(columns?)` defaults an OMITTED argument
// to `*`, so a no-arg `.select()` on a Supabase builder is just as broad as
// `.select("*")` — both are caught here.
//
// Comments are stripped (so a `// don't use select("*")` note doesn't trip it)
// but string contents are kept — the literal `"*"` argument is a signal, and a
// named `.select("id, name")` must stay visibly non-empty. The no-arg form is
// anchored to a `.from(...)` builder (same statement or a from-bound alias) so a
// DOM `input.select()` / `textarea.select()` is never flagged.

const RUNTIME = stripFiles(
  readSourceFiles({
    roots: ["app", "lib", "components", "proxy.ts"],
    extensions: [".ts", ".tsx"],
    exclude: [...TEST_FILE_EXCLUDES],
  }),
  stripComments
);

const EXPLICIT_STAR = /\.select\(\s*(['"])\*\1\s*\)/;
const EMPTY_SELECT = /\.select\(\s*\)/;
const FROM = /\.from\s*\(/g;
// `const|let|var NAME = ….from(…)` — NAME is a builder bound to a table.
const FROM_ALIAS =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;{}=]*?\.from\s*\(/g;

function findSelectStar(file: SourceFile): string[] {
  const hits: string[] = [];
  // 1) Explicit `select("*")` anywhere — unambiguous regardless of chaining.
  file.text.split(/\r?\n/).forEach((line, i) => {
    if (EXPLICIT_STAR.test(line)) {
      hits.push(`${file.relPath}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  });

  const flat = file.text.replace(/\s+/g, " ");

  // 2) No-arg `.select()` within a `.from(...)` statement.
  let m: RegExpExecArray | null;
  while ((m = FROM.exec(flat)) !== null) {
    const semi = flat.indexOf(";", m.index);
    const seg = flat.slice(m.index, semi === -1 ? m.index + 400 : semi);
    if (EMPTY_SELECT.test(seg)) {
      hits.push(`${file.relPath}: no-arg .select() on a .from() builder`);
    }
  }

  // 3) No-arg `.select()` on a from-bound alias (write/read split across
  //    statements: `const q = client.from("t"); q.select()`).
  const aliases = new Set<string>();
  let a: RegExpExecArray | null;
  while ((a = FROM_ALIAS.exec(flat)) !== null) aliases.add(a[1]);
  for (const alias of aliases) {
    if (new RegExp(`\\b${alias}\\s*\\.select\\(\\s*\\)`).test(flat)) {
      hits.push(`${file.relPath}: no-arg .select() via alias '${alias}'`);
    }
  }
  return hits;
}

describe('fitness: no select("*") in runtime code', () => {
  it("app/**, lib/**, components/** never select('*') or no-arg select()", () => {
    const hits = RUNTIME.flatMap(findSelectStar);
    expect(
      hits,
      hits.length === 0
        ? ""
        : `Reads must use explicit column allowlists, not select("*") or a ` +
            `no-arg select():\n${hits.map((h) => `  ${h}`).join("\n")}`
    ).toEqual([]);
  });
});
