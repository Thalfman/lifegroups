// Lightweight SQL function parser for the SECURITY DEFINER search_path check
// (issue #697). It is NOT a SQL grammar — it only needs to read function
// *headers* (everything before the `AS $body$`) plus `ALTER FUNCTION` statements,
// so the search_path fitness check can reason per-function-signature instead of
// per-file text counts.
//
// Why per-signature and "effective state": migrations are append-only history.
// A function created early without `set search_path` and later re-created (or
// `ALTER`ed) WITH it is correct at runtime — Postgres only keeps the final
// definition. So the check folds every CREATE/ALTER for a signature, in filename
// order, and asks whether the *last* effective state pins search_path. This also
// matches the remediation the issue prefers: an additive
// `ALTER FUNCTION … SET search_path` rather than rewriting a function body.

import type { SourceFile } from "./source-globber";
import { stripSqlComments } from "./scan";

/** A parsed `CREATE [OR REPLACE] FUNCTION` header (body intentionally ignored). */
export interface CreateFunctionStatement {
  /** Normalized signature key: `schema.name(argtype, …)` lowercased. */
  readonly signature: string;
  /** Schema-qualified function name, lowercased. */
  readonly name: string;
  /** Normalized argument types (names/defaults/modes stripped). */
  readonly argTypes: readonly string[];
  /** Header contains `security definer`. */
  readonly isSecurityDefiner: boolean;
  /** Header contains `set search_path`. */
  readonly pinsSearchPath: boolean;
  readonly relPath: string;
  /** 1-based line of the `create … function` keyword in the raw file. */
  readonly line: number;
  /** Character offset of the statement in the file — used to fold in textual order. */
  readonly pos: number;
}

/** A parsed `ALTER FUNCTION … SET search_path …` statement. */
export interface AlterFunctionStatement {
  readonly signature: string;
  readonly name: string;
  readonly setsSearchPath: boolean;
  readonly relPath: string;
  readonly line: number;
  /** Character offset of the statement in the file — used to fold in textual order. */
  readonly pos: number;
}

export interface ParsedSqlFunctions {
  readonly creates: readonly CreateFunctionStatement[];
  readonly alters: readonly AlterFunctionStatement[];
}

/** The folded, final-state view of one function signature across all migrations. */
export interface EffectiveFunction {
  readonly signature: string;
  readonly name: string;
  readonly argTypes: readonly string[];
  /** Effective: is the final definition `security definer`? */
  readonly isSecurityDefiner: boolean;
  /** Effective: does the final state pin `search_path` (inline OR via ALTER)? */
  readonly pinsSearchPath: boolean;
  /** `file:line` of the last `create … function` for this signature. */
  readonly definedAt: string;
}

// Read the parenthesized argument list starting at `open` (index of the "("),
// returning the inner text and the index just past the matching ")". Tracks
// nesting so nested parens (e.g. `numeric(10,2)`, `table(...)`) don't end it
// early.
function readBalancedParens(
  text: string,
  open: number
): { inner: string; end: number } {
  let depth = 0;
  let inner = "";
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
      if (depth === 1) continue; // skip the opening paren itself
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return { inner, end: i + 1 };
    }
    if (depth >= 1) inner += ch;
  }
  return { inner, end: text.length };
}

// Split an argument list on TOP-LEVEL commas only (so `numeric(10, 2)` stays one
// argument).
function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/**
 * Normalize a parameter list to its bare type list, lowercased: drop the
 * parameter name, the `IN`/`OUT`/`INOUT`/`VARIADIC` mode, and any `DEFAULT …` /
 * `= …`. This is what makes overloaded functions (same name, different args)
 * distinguishable. Heuristic by design — overloads it can't cleanly tell apart
 * still collapse to one key, which is conservative (it can only HIDE a pinned
 * twin, never invent a violation), and such cases are surfaced for the PR.
 */
export function normalizeArgTypes(params: string): string[] {
  return splitTopLevel(params)
    .map((raw) => {
      let s = raw.trim();
      if (!s) return "";
      // Drop a DEFAULT expression (keyword form or `=`).
      s = s
        .split(/\bdefault\b/i)[0]
        .split("=")[0]
        .trim();
      // Drop a leading argument mode.
      s = s.replace(/^(in|out|inout|variadic)\s+/i, "");
      // `paramname type…` → `type…` (first token is the name when 2+ tokens).
      const tokens = s.split(/\s+/);
      if (tokens.length >= 2) tokens.shift();
      return tokens.join(" ").toLowerCase();
    })
    .filter((t) => t !== "");
}

function lineOf(rawText: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < rawText.length; i++) {
    if (rawText[i] === "\n") line++;
  }
  return line;
}

const CREATE_FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_."]+)\s*\(/gi;
const ALTER_FN_RE = /alter\s+function\s+([a-z0-9_."]+)\s*\(/gi;

/**
 * Parse one migration file's text. Comments are stripped first (a CREATE example
 * in a comment must not count); newlines are preserved so reported line numbers
 * align with the raw file. The function BODY is never inspected — a dollar-quoted
 * body that mentions "security definer" or "search_path" cannot trip the check.
 */
export function parseSqlFunctions(file: SourceFile): ParsedSqlFunctions {
  const text = stripSqlComments(file.text);
  const creates: CreateFunctionStatement[] = [];
  const alters: AlterFunctionStatement[] = [];

  CREATE_FN_RE.lastIndex = 0;
  for (let m = CREATE_FN_RE.exec(text); m; m = CREATE_FN_RE.exec(text)) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    const open = text.indexOf("(", m.index);
    const { inner, end } = readBalancedParens(text, open);
    const argTypes = normalizeArgTypes(inner);
    // Header = everything from the arg-list close up to the body delimiter
    // `AS $…$` / `AS '…'`. Only this region decides definer/search_path.
    const rest = text.slice(end);
    const bodyDelim = rest.search(/\bas\b\s*(?:\$|')/i);
    const header =
      bodyDelim >= 0 ? rest.slice(0, bodyDelim) : rest.slice(0, 600);
    creates.push({
      signature: `${name}(${argTypes.join(",")})`,
      name,
      argTypes,
      isSecurityDefiner: /security\s+definer/i.test(header),
      pinsSearchPath: /set\s+search_path/i.test(header),
      relPath: file.relPath,
      line: lineOf(file.text, m.index),
      pos: m.index,
    });
    CREATE_FN_RE.lastIndex = end;
  }

  ALTER_FN_RE.lastIndex = 0;
  for (let m = ALTER_FN_RE.exec(text); m; m = ALTER_FN_RE.exec(text)) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    const open = text.indexOf("(", m.index);
    const { inner, end } = readBalancedParens(text, open);
    const rest = text.slice(end);
    const stmtEnd = rest.indexOf(";");
    const stmt = stmtEnd >= 0 ? rest.slice(0, stmtEnd) : rest;
    const argTypes = normalizeArgTypes(inner);
    alters.push({
      signature: `${name}(${argTypes.join(",")})`,
      name,
      setsSearchPath: /set\s+search_path/i.test(stmt),
      relPath: file.relPath,
      line: lineOf(file.text, m.index),
      pos: m.index,
    });
    ALTER_FN_RE.lastIndex = end;
  }

  return { creates, alters };
}

/**
 * Fold every CREATE/ALTER across `files` (process in the given order — callers
 * pass migrations sorted by filename, which `readSourceFiles` already does) into
 * the final effective state per signature. A later CREATE OR REPLACE overrides
 * the header flags; a later `ALTER … SET search_path` pins an existing signature.
 *
 * Statements WITHIN a file are folded in textual (char-offset) order, so a file
 * that ALTERs a function and then re-creates it without `search_path` ends
 * unpinned — matching Postgres, where the last definition wins.
 */
export function effectiveFunctions(
  files: readonly SourceFile[]
): EffectiveFunction[] {
  const state = new Map<string, EffectiveFunction>();

  for (const file of files) {
    const { creates, alters } = parseSqlFunctions(file);
    const ordered = [
      ...creates.map((c) => ({ pos: c.pos, kind: "create" as const, c })),
      ...alters.map((a) => ({ pos: a.pos, kind: "alter" as const, a })),
    ].sort((x, y) => x.pos - y.pos);

    for (const stmt of ordered) {
      if (stmt.kind === "create") {
        const c = stmt.c;
        state.set(c.signature, {
          signature: c.signature,
          name: c.name,
          argTypes: c.argTypes,
          isSecurityDefiner: c.isSecurityDefiner,
          pinsSearchPath: c.pinsSearchPath,
          definedAt: `${c.relPath}:${c.line}`,
        });
      } else if (stmt.a.setsSearchPath) {
        const existing = state.get(stmt.a.signature);
        if (existing) {
          state.set(stmt.a.signature, { ...existing, pinsSearchPath: true });
        }
      }
    }
  }

  return [...state.values()];
}

/**
 * The check's payload: SECURITY DEFINER functions whose effective final state
 * does NOT pin `search_path`. Empty means the invariant holds.
 */
export function unpinnedSecurityDefiners(
  files: readonly SourceFile[]
): EffectiveFunction[] {
  return effectiveFunctions(files)
    .filter((f) => f.isSecurityDefiner && !f.pinsSearchPath)
    .sort((a, b) => a.signature.localeCompare(b.signature));
}
