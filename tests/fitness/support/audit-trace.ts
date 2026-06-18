// Variable tracing + audit-payload parsing for the audit-leak guard (#706, #710).
//
// The audit-leak check (`audit-no-sensitive-plaintext`) must catch a sealed
// column value reaching `audit_events` metadata by ANY path: directly at the
// insert site, or assembled into a plpgsql variable first —
//
//     v_after := jsonb_build_object('body', v_body);
//     insert into public.audit_events (...) values (..., 'after', v_after);
//
// These helpers expand each audit insert with the jsonb-payload variables it
// references, then expose the payload two ways the check scans in tandem:
//   - KEY-AWARE: the `jsonb_build_object('<field>', <value>)` pairs, so a sealed
//     audit FIELD (e.g. `'leader_visible_note'`, `'notes'`) is caught however the
//     value is named or sanitized, and an admin-private-only field
//     (`'admin_metric_notes'`) is recognised as in-policy.
//   - TOKEN: the raw expanded text (strings stripped), so a sealed value carried
//     under a NON-sealed key (`jsonb_build_object('x', v_body)`) is still caught.
//
// To support the key-aware view, this module preserves single-quoted string
// literals (the jsonb keys) and is therefore STRING-AWARE: every scan tracks the
// `''` escape so a `;`, `(`, `)`, or `,` inside a literal can't desync block,
// statement, or argument boundaries. Comments and dollar-quoted bodies are still
// removed, so a token inside a comment or a `$tag$ … $tag$` literal never counts.

import { stripDollarQuoted, stripSqlComments } from "./scan";

/**
 * Remove comments and (optionally) dollar-quoted bodies but KEEP single-quoted
 * string literals — the jsonb keys the key-aware scan reads. Callers that pass an
 * EXTRACTED function body (outer `$$` already removed) set `stripDollar` so an
 * inner `$tag$ … $tag$` literal can't fake a key or assignment.
 */
export function preprocessKeepStrings(
  sql: string,
  options: { stripDollar?: boolean } = {}
): string {
  const commentless = stripSqlComments(sql);
  return options.stripDollar ? stripDollarQuoted(commentless) : commentless;
}

// Index of the first `;` at paren-depth 0 outside any string at/after `start`,
// or `text.length`. String-aware (`''` escape) so a literal terminator is ignored.
function statementEnd(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "'") {
        if (text[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") inStr = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth <= 0) return i;
  }
  return text.length;
}

const AUDIT_INSERT_RE = /\binsert\s+into\s+public\.audit_events\b/gi;

/**
 * Slice every `insert into public.audit_events …;` statement (string-aware,
 * balanced to the depth-0 `;`), preserving keys. The `\b` after `audit_events`
 * excludes a same-prefix table like `audit_events_archive`. Mirrors
 * `scan.auditInsertBlocks` but keeps string literals so the key-aware scan works.
 */
export function auditMetadataBlocks(
  sql: string,
  options: { stripDollar?: boolean } = {}
): string[] {
  const text = preprocessKeepStrings(sql, options);
  const blocks: string[] = [];
  AUDIT_INSERT_RE.lastIndex = 0;
  for (let m = AUDIT_INSERT_RE.exec(text); m; m = AUDIT_INSERT_RE.exec(text)) {
    const end = statementEnd(text, m.index);
    blocks.push(text.slice(m.index, end));
    AUDIT_INSERT_RE.lastIndex = m.index + 1;
  }
  return blocks;
}

// A right-hand side that ASSEMBLES jsonb (vs. a scalar/text computation). Only
// these are inlined: following them surfaces the inner audit fields/values that
// land in the payload. A scalar `v_notes := nullif(p_notes, '')` is left to be
// judged where it lands (the key-aware scan reads the field it is keyed under).
function isJsonbAssembly(rhs: string): boolean {
  return /\bjsonb_build_object\b|\bjsonb_build_array\b|\bto_jsonb\b|\bjsonb_object\b|\|\|/i.test(
    rhs
  );
}

// `v_name` or `v_name <type>` immediately before `:=` — captures both plain
// assignments and typed DECLARE-block initializers (`v_after jsonb := …`).
const ASSIGN_RE =
  /\b(v_\w+)(?:\s+[a-zA-Z][\w."]*(?:\s*\([^)]*\))?(?:\s*\[\])?)?\s*:=/g;
// `… into v_x` with a SINGLE target (no following comma → not a multi-column
// record capture). The enclosing SELECT/RETURNING value expression is the RHS.
const INTO_RE = /\binto\s+(v_\w+)\s*(?![\s,]*,)/gi;
const SOURCE_KW_RE = /\b(select|returning)\b/gi;

/**
 * Collect every right-hand side assigned to a `v_*` local variable in
 * `keepStringsText` (already run through `preprocessKeepStrings`). Three plpgsql
 * forms are recognised:
 *   1. `v_x := <rhs>;`                          plain assignment
 *   2. `v_x <type> := <rhs>;`                   typed DECLARE initializer (#710)
 *   3. `select|returning <jsonb…> into v_x`     single-target JSON snapshot (#710)
 *
 * For form 3 only a jsonb-assembly source is kept — a multi-column row/record
 * capture (`select c1, c2, notes into v_row`) is neither single-target nor
 * jsonb-assembly, so it never enters and can't surface a whole row's columns.
 */
export function collectVariableAssignments(
  keepStringsText: string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, rhs: string) => {
    const trimmed = rhs.trim();
    if (!trimmed) return;
    const list = out.get(name);
    if (list) list.push(trimmed);
    else out.set(name, [trimmed]);
  };

  ASSIGN_RE.lastIndex = 0;
  for (
    let m = ASSIGN_RE.exec(keepStringsText);
    m;
    m = ASSIGN_RE.exec(keepStringsText)
  ) {
    const rhs = keepStringsText.slice(
      ASSIGN_RE.lastIndex,
      statementEnd(keepStringsText, ASSIGN_RE.lastIndex)
    );
    add(m[1], rhs);
    ASSIGN_RE.lastIndex += rhs.length;
  }

  INTO_RE.lastIndex = 0;
  for (
    let m = INTO_RE.exec(keepStringsText);
    m;
    m = INTO_RE.exec(keepStringsText)
  ) {
    let sourceStart = -1;
    SOURCE_KW_RE.lastIndex = 0;
    for (
      let s = SOURCE_KW_RE.exec(keepStringsText);
      s && s.index < m.index;
      s = SOURCE_KW_RE.exec(keepStringsText)
    ) {
      sourceStart = s.index + s[0].length;
    }
    if (sourceStart < 0) continue;
    const rhs = keepStringsText.slice(sourceStart, m.index);
    if (isJsonbAssembly(rhs)) add(m[1], rhs);
  }

  return out;
}

const VAR_REF_RE = /\bv_\w+\b/g;

// `v_x` references that are NOT a bare `… is [not] null` presence predicate. A
// variable used only to record presence never carries its value into the payload.
function valueReferencedVars(scope: string): Set<string> {
  const refs = new Set<string>();
  VAR_REF_RE.lastIndex = 0;
  for (let m = VAR_REF_RE.exec(scope); m; m = VAR_REF_RE.exec(scope)) {
    const after = scope.slice(m.index + m[0].length).trimStart();
    if (/^is\s+(not\s+)?null\b/i.test(after)) continue;
    refs.add(m[0]);
  }
  return refs;
}

/**
 * Expand `text` (an audit insert block) by inlining the right-hand sides of the
 * jsonb-payload variables it references as VALUES, transitively, using
 * `assignments`. A variable is inlined only when (a) it is referenced as a value
 * (not merely `is [not] null`) and (b) its assignment is jsonb assembly. Each
 * variable is inlined at most once (cycle guard) and recursion is capped at
 * `maxDepth`. The result is the block followed by the inlined payload bodies, so
 * fields/values reaching audit only through a variable are visible to both the
 * key-aware and token scans as if written at the insert site.
 */
export function expandVariableReferences(
  text: string,
  assignments: Map<string, string[]>,
  maxDepth = 6
): string {
  const parts: string[] = [text];
  const seen = new Set<string>();
  const walk = (scope: string, depth: number) => {
    if (depth > maxDepth) return;
    for (const ref of valueReferencedVars(scope)) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const rhsList = assignments.get(ref);
      if (!rhsList) continue;
      for (const rhs of rhsList) {
        if (!isJsonbAssembly(rhs)) continue;
        parts.push(rhs);
        walk(rhs, depth + 1);
      }
    }
  };
  walk(text, 0);
  return parts.join("\n");
}

/** One `'<field>', <value>` argument of a `jsonb_build_object(...)` call. */
export interface AuditFieldPair {
  /** The field name when the key is a string literal; `null` for a dynamic key. */
  readonly key: string | null;
  /** The value expression text (trimmed). */
  readonly value: string;
}

// Read the balanced `(...)` starting at `open` (index of "("), string-aware.
// Returns the inner text and the index just past the matching ")".
function readBalanced(
  text: string,
  open: number
): { inner: string; end: number } {
  let depth = 0;
  let inStr = false;
  let inner = "";
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      inner += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") {
          inner += text[i + 1];
          i++;
        } else inStr = false;
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      if (depth >= 1) inner += ch;
    } else if (ch === "(") {
      depth++;
      if (depth === 1) continue;
      inner += ch;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return { inner, end: i + 1 };
      inner += ch;
    } else if (depth >= 1) {
      inner += ch;
    }
  }
  return { inner, end: text.length };
}

// Split an argument list on TOP-LEVEL commas only, string-aware.
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (args[i + 1] === "'") {
          cur += args[i + 1];
          i++;
        } else inStr = false;
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      cur += ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "]") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const JSONB_BUILD_OBJECT_RE = /\bjsonb_build_object\s*\(/gi;
// A key item that is a single-quoted string literal → its inner field name.
const KEY_LITERAL_RE = /^\s*'([^']*)'\s*$/;

/**
 * Every `'<field>', <value>` pair across all `jsonb_build_object(...)` calls in
 * `keepStringsText`. Pairs are read by alternating top-level argument (key, value,
 * key, value, …); a non-string-literal key (a dynamic `v_key`) yields `key: null`.
 * Nested `jsonb_build_object(...)` values are found by the same scan in their own
 * right, so deep payloads are fully covered.
 */
export function auditFieldPairs(keepStringsText: string): AuditFieldPair[] {
  const pairs: AuditFieldPair[] = [];
  JSONB_BUILD_OBJECT_RE.lastIndex = 0;
  for (
    let m = JSONB_BUILD_OBJECT_RE.exec(keepStringsText);
    m;
    m = JSONB_BUILD_OBJECT_RE.exec(keepStringsText)
  ) {
    const open = keepStringsText.indexOf("(", m.index);
    const { inner } = readBalanced(keepStringsText, open);
    const args = splitArgs(inner);
    for (let i = 0; i + 1 < args.length; i += 2) {
      const keyMatch = KEY_LITERAL_RE.exec(args[i]);
      pairs.push({
        key: keyMatch ? keyMatch[1] : null,
        value: args[i + 1].trim(),
      });
    }
    // Resume just past the `(` so a NESTED jsonb_build_object value is found in
    // its own right on a later iteration.
    JSONB_BUILD_OBJECT_RE.lastIndex = open + 1;
  }
  return pairs;
}

// A value expression that cannot carry a sealed column's runtime content, so it
// is in-policy under any audit field:
//   - a PRESENCE predicate: `<x> is [not] null`;
//   - a CARDINALITY/TYPE reduction: `jsonb_array_length(...)`, `array_length(...)`,
//     `cardinality(...)`, `jsonb_typeof(...)`;
//   - a CONSTANT: a bare boolean/integer/null, or a single-quoted string literal
//     the author wrote in the migration (optionally cast) — e.g. a hardcoded
//     backfill `'reason'`. A literal is source text, never a column's value.
export function isContentFreeValue(value: string): boolean {
  const v = value.trim();
  return (
    /\bis\s+(not\s+)?null\b/i.test(v) ||
    /^(?:jsonb_array_length|array_length|cardinality|jsonb_typeof)\s*\(/i.test(
      v
    ) ||
    /^(?:true|false|null)$/i.test(v) ||
    /^\d+$/.test(v) ||
    /^'(?:[^']|'')*'(?:\s*::\s*[\w".]+)?$/.test(v)
  );
}

const DO_BLOCK_RE = /\bdo\b\s*(?:language\s+\w+\s+)?(\$[A-Za-z_0-9]*\$)/gi;

/**
 * Extract the body of each top-level `DO $tag$ … $tag$` block from RAW migration
 * text (comments stripped first). Used to scope variable-assignment collection
 * for audit inserts that live in DO-block backfills rather than function bodies,
 * so a same-named variable inside a sibling `CREATE FUNCTION` body in the same
 * file can't pollute the trace.
 */
export function doBlockBodies(rawText: string): string[] {
  const text = stripSqlComments(rawText);
  const bodies: string[] = [];
  DO_BLOCK_RE.lastIndex = 0;
  for (let m = DO_BLOCK_RE.exec(text); m; m = DO_BLOCK_RE.exec(text)) {
    const tag = m[1];
    const bodyStart = m.index + m[0].length;
    const close = text.indexOf(tag, bodyStart);
    const end = close === -1 ? text.length : close;
    bodies.push(text.slice(bodyStart, end));
    DO_BLOCK_RE.lastIndex = end + tag.length;
  }
  return bodies;
}
