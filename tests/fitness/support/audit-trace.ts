// Variable tracing for the audit-leak guard (issue #706).
//
// The audit-leak check (`audit-no-sensitive-plaintext`) must catch a sealed
// column value that reaches `audit_events` metadata not only directly at the
// insert site but also through a plpgsql local variable assembled first:
//
//     v_after := jsonb_build_object('body', v_body);
//     insert into public.audit_events (...) values (..., 'after', v_after);
//
// These helpers fold each audit insert together with the right-hand sides of the
// jsonb-payload variables it references, so the column scan that guards the
// insert site also sees a value that arrives via variable indirection (the
// `v_body` token above surfaces into the scanned text).
//
// Everything here is pure and operates on the SAME comment/dollar/string-stripped
// text that `auditInsertBlocks` matches against, so a sensitive token inside a
// comment or a string literal (e.g. a jsonb KEY `'admin_metric_notes'`) can never
// be mistaken for real value flow.
//
// Two deliberate narrowings keep the trace precise (avoiding false positives the
// blast-radius analysis in #706 confirmed are not leaks):
//   - Only `v_* := <rhs>` ASSIGNMENTS are traced. Record captures
//     (`select c1, c2, notes into v_row`) are NOT — they would surface every
//     column of a row, even though only the `.field` accesses actually reach
//     audit (and those are scanned, presence-aware, at the reference site).
//   - A variable is only FOLLOWED when its right-hand side is jsonb-payload
//     assembly (`jsonb_build_object` / `jsonb_build_array` / `to_jsonb` / a
//     `||` merge). A scalar assignment (`v_notes := nullif(p_notes, '')`) is not
//     inlined — its NAME, where it lands in an audit jsonb, is the signal the
//     reference-site scan already keys on.

import { stripDollarQuoted, stripSqlComments, stripSqlStrings } from "./scan";

/**
 * Normalize a SQL scope the way `auditInsertBlocks` does before matching: strip
 * comments, optionally blank dollar-quoted literals, then blank single-quoted
 * strings. Callers that pass an EXTRACTED function body (its outer `$$` already
 * removed) set `stripDollar` so an inner `$tag$ … $tag$` literal can't fake an
 * assignment; callers scanning RAW migration text (where the DO-block / function
 * body IS the outer dollar quote) leave it off.
 */
export function normalizeSqlScope(
  sql: string,
  options: { stripDollar?: boolean } = {}
): string {
  const commentless = stripSqlComments(sql);
  const deDollared = options.stripDollar
    ? stripDollarQuoted(commentless)
    : commentless;
  return stripSqlStrings(deDollared);
}

// Read from `start` to the next statement-terminating `;` at paren-depth 0, so a
// `;`-free expression with nested parens (e.g. `jsonb_build_object(a, (b))`)
// stays whole. Returns the slice (excluding the `;`).
function readToStatementEnd(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth <= 0) return text.slice(start, i);
  }
  return text.slice(start);
}

const ASSIGN_RE = /\b(v_\w+)\s*:=\s*/g;

/**
 * Collect every right-hand side assigned to a `v_*` local variable via the
 * plpgsql `v_x := <rhs>;` form in `normalizedText` (already run through
 * `normalizeSqlScope`). A variable assigned more than once keeps all of its
 * right-hand sides. `SELECT … INTO` row/record captures are intentionally not
 * collected (see the module header).
 */
export function collectVariableAssignments(
  normalizedText: string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  ASSIGN_RE.lastIndex = 0;
  for (
    let m = ASSIGN_RE.exec(normalizedText);
    m;
    m = ASSIGN_RE.exec(normalizedText)
  ) {
    const rhs = readToStatementEnd(normalizedText, ASSIGN_RE.lastIndex).trim();
    ASSIGN_RE.lastIndex += rhs.length;
    if (!rhs) continue;
    const list = out.get(m[1]);
    if (list) list.push(rhs);
    else out.set(m[1], [rhs]);
  }
  return out;
}

// A right-hand side that ASSEMBLES jsonb (vs. a scalar/text computation). Only
// these are inlined: following them surfaces the inner value tokens that land in
// the audit payload (`jsonb_build_object('body', v_body)` → the `v_body` token),
// while a scalar `v_notes := nullif(p_notes, '')` is left to be judged by its
// own reference site.
function isJsonbAssembly(rhs: string): boolean {
  return /\bjsonb_build_object\b|\bjsonb_build_array\b|\bto_jsonb\b|\bjsonb_object\b|\|\|/i.test(
    rhs
  );
}

const VAR_REF_RE = /\bv_\w+\b/g;

// `v_x` references that are NOT a bare `… is [not] null` presence predicate.
// Only these warrant inlining: a variable used solely to record presence never
// carries its value into the payload.
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
 * variable is inlined at most once (guarding against assignment cycles) and
 * recursion is capped at `maxDepth`. The result is the original block followed by
 * the inlined payload bodies, so a value reaching audit only through a
 * `v_* := jsonb_build_object(...)` indirection is visible to the reference-site
 * scan exactly as if it had been written at the insert site.
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
