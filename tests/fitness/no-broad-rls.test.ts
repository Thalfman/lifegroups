import { describe, expect, it } from "vitest";

import { readSourceFiles, type SourceFile } from "./support/source-globber";
import { stripSqlComments } from "./support/scan";

// Security invariant (CLAUDE.md / AGENTS.md, audit 2026-06-21 TEST-5): no broad
// Row-Level-Security read policy. A `using (true)` or `using (auth.uid() is not
// null)` SELECT policy exposes a whole table to every authenticated user — the
// exact class of bug the audit caught on `app_settings` (briefly world-readable
// to any authed user before `20260629000000_seal_app_settings_to_admin.sql`
// sealed it). RLS is the real read boundary, so a broad `USING` clause that
// slips into a migration silently widens visibility past the oversight ladder.
//
// Migrations are append-only history, so this folds CREATE/DROP POLICY to the
// NET-EFFECTIVE policy set per `(table, policy)` in filename order: a broad
// policy that a later migration drops (as the app_settings remediation does) is
// NOT flagged — only a broad clause that survives to the final schema is.
//
// Scope: the SELECT/USING boundary the audit named. The repo has zero write RLS
// policies (writes are RPC-only), so a broad WITH CHECK is not a current concern;
// the parser still reads the USING clause specifically, ignoring WITH CHECK.

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

interface PolicyRef {
  readonly table: string;
  readonly name: string;
}

interface CreatedPolicy extends PolicyRef {
  readonly broad: boolean;
  readonly definedAt: string;
  readonly pos: number;
}

interface DroppedPolicy extends PolicyRef {
  readonly pos: number;
}

const CREATE_POLICY_RE =
  /\bcreate\s+policy\s+("?[a-z0-9_]+"?)\s+on\s+([a-z0-9_."]+)/gi;
const DROP_POLICY_RE =
  /\bdrop\s+policy\s+(?:if\s+exists\s+)?("?[a-z0-9_]+"?)\s+on\s+([a-z0-9_."]+)/gi;

function clean(id: string): string {
  return id
    .replace(/"/g, "")
    .replace(/^public\./, "")
    .toLowerCase();
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

// Read the balanced `( … )` group starting at the first `(` at/after `from`.
function readParens(
  text: string,
  from: number
): { inner: string; end: number } {
  const open = text.indexOf("(", from);
  if (open === -1) return { inner: "", end: text.length };
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) {
      return { inner: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return { inner: text.slice(open + 1), end: text.length };
}

// A USING clause is "broad" when, stripped of whitespace and any wrapping
// parens, it is exactly `true` or its sole predicate is `auth.uid() is not null`
// — i.e. it admits every authenticated caller. A clause that ANDs/ORs that with
// a real predicate (defense-in-depth) is NOT broad.
function isBroadClause(raw: string): boolean {
  let s = raw.replace(/\s+/g, " ").trim().toLowerCase();
  // Peel redundant wrapping parens: ((true)) → true.
  while (s.startsWith("(") && s.endsWith(")")) {
    const inner = s.slice(1, -1).trim();
    // Only peel when the outer parens actually wrap the whole expression.
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") depth++;
      else if (inner[i] === ")") depth--;
      if (depth < 0) {
        wraps = false;
        break;
      }
    }
    if (!wraps || depth !== 0) break;
    s = inner;
  }
  return s === "true" || /^auth\.uid\(\)\s+is\s+not\s+null$/.test(s);
}

// Parse one migration's CREATE POLICY statements, extracting the USING clause.
function createdPoliciesIn(file: SourceFile): CreatedPolicy[] {
  const text = stripSqlComments(file.text);
  const out: CreatedPolicy[] = [];
  CREATE_POLICY_RE.lastIndex = 0;
  for (
    let m = CREATE_POLICY_RE.exec(text);
    m;
    m = CREATE_POLICY_RE.exec(text)
  ) {
    const name = clean(m[1]);
    const table = clean(m[2]);
    // Statement spans to the terminating `;` at paren depth 0.
    let depth = 0;
    let stmtEnd = text.length;
    for (let i = CREATE_POLICY_RE.lastIndex; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      else if (text[i] === ";" && depth <= 0) {
        stmtEnd = i;
        break;
      }
    }
    const stmt = text.slice(m.index, stmtEnd);
    const usingMatch = /\busing\b/i.exec(stmt);
    const broad = usingMatch
      ? isBroadClause(readParens(stmt, usingMatch.index).inner)
      : false;
    out.push({
      table,
      name,
      broad,
      definedAt: `${file.relPath}:${lineOf(file.text, m.index)}`,
      pos: m.index,
    });
    CREATE_POLICY_RE.lastIndex = stmtEnd;
  }
  return out;
}

function droppedPoliciesIn(file: SourceFile): DroppedPolicy[] {
  const text = stripSqlComments(file.text);
  const out: DroppedPolicy[] = [];
  DROP_POLICY_RE.lastIndex = 0;
  for (let m = DROP_POLICY_RE.exec(text); m; m = DROP_POLICY_RE.exec(text)) {
    out.push({ name: clean(m[1]), table: clean(m[2]), pos: m.index });
  }
  return out;
}

// Fold every CREATE/DROP POLICY across migrations (filename order) into the
// net-effective policy set, keyed by `table.policy`. Statements WITHIN a file
// are folded in textual (char-offset) order, so a migration that drops a policy
// and then re-creates it (the re-guard pattern) ends with the re-created policy,
// not an empty slot — matching Postgres, where the last statement wins.
function effectivePolicies(files: readonly SourceFile[]): CreatedPolicy[] {
  const state = new Map<string, CreatedPolicy>();
  for (const file of files) {
    const stmts = [
      ...createdPoliciesIn(file).map((c) => ({ pos: c.pos, create: c })),
      ...droppedPoliciesIn(file).map((d) => ({ pos: d.pos, drop: d })),
    ].sort((a, b) => a.pos - b.pos);
    for (const stmt of stmts) {
      if ("create" in stmt) {
        state.set(`${stmt.create.table}.${stmt.create.name}`, stmt.create);
      } else {
        state.delete(`${stmt.drop.table}.${stmt.drop.name}`);
      }
    }
  }
  return [...state.values()];
}

describe("fitness: no broad RLS read policies", () => {
  it("finds migrations to scan (guards against a broken glob)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("no net-effective policy has a broad USING clause", () => {
    const broad = effectivePolicies(MIGRATIONS)
      .filter((p) => p.broad)
      .map((p) => `  ${p.table}.${p.name}  (${p.definedAt})`)
      .sort();
    expect(
      broad,
      broad.length === 0
        ? ""
        : `These RLS policies use a broad USING clause (\`true\` or ` +
            `\`auth.uid() is not null\`), exposing the whole table to every ` +
            `authenticated user. Scope the policy to the oversight ladder ` +
            `(\`auth_is_admin()\`, \`auth_role()\`, ownership, …):\n${broad.join(
              "\n"
            )}`
    ).toEqual([]);
  });

  it("actually parses CREATE POLICY statements (sanity floor)", () => {
    // Guard against a vacuous pass from a broken parser: the RLS-heavy schema
    // defines many policies.
    expect(effectivePolicies(MIGRATIONS).length).toBeGreaterThan(20);
  });
});
