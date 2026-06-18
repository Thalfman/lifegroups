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

/** A parsed `CREATE [OR REPLACE] FUNCTION` header (plus its body, for #700). */
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
  /** Header declares `returns trigger` or `returns event_trigger`. */
  readonly returnsTrigger: boolean;
  /** Header declares `stable` or `immutable` (a function that cannot do DML). */
  readonly isReadOnlyVolatility: boolean;
  /**
   * The function body, comment-stripped with the `AS $tag$ … $tag$` (or `AS '…'`)
   * delimiters removed. `""` when no body is found. Used by the write/audit
   * classifier (#700); the search_path check (#697) never reads it.
   */
  readonly body: string;
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

/**
 * A parsed `GRANT|REVOKE … EXECUTE ON FUNCTION … TO|FROM <roles>` statement (or
 * the schema-wide `… ON ALL FUNCTIONS IN SCHEMA <s> …` form). Used (#700) to know
 * whether a function is reachable by an app login role — Postgres grants EXECUTE
 * to `PUBLIC` by DEFAULT, so a function is callable by the app unless that
 * default is explicitly revoked.
 */
export interface GrantFunctionStatement {
  /** Target signature for a per-function grant; `null` for a schema-wide grant. */
  readonly signature: string | null;
  /** Schema for `ON ALL FUNCTIONS IN SCHEMA <s>`; `null` for a per-function grant. */
  readonly allInSchema: string | null;
  readonly name: string;
  readonly action: "grant" | "revoke";
  /** Target roles, lowercased (`public`, `anon`, `authenticated`, `service_role`, …). */
  readonly roles: readonly string[];
  readonly relPath: string;
  readonly line: number;
  /** Character offset of the statement in the file — used to fold in textual order. */
  readonly pos: number;
}

/**
 * A parsed `DROP FUNCTION [IF EXISTS] name(args)` statement. Dropping a function
 * also drops its grants in Postgres — a later CREATE of the same signature starts
 * from the default PUBLIC EXECUTE — so the fold must reset both the definition and
 * the grant state for that signature (#700 follow-up).
 */
export interface DropFunctionStatement {
  readonly signature: string;
  readonly name: string;
  readonly relPath: string;
  readonly line: number;
  /** Character offset of the statement in the file — used to fold in textual order. */
  readonly pos: number;
}

export interface ParsedSqlFunctions {
  readonly creates: readonly CreateFunctionStatement[];
  readonly alters: readonly AlterFunctionStatement[];
  readonly grants: readonly GrantFunctionStatement[];
  readonly drops: readonly DropFunctionStatement[];
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
  /** Effective: does the final definition `returns trigger` / `event_trigger`? */
  readonly returnsTrigger: boolean;
  /** Effective: is the final definition `stable`/`immutable` (no DML)? */
  readonly isReadOnlyVolatility: boolean;
  /**
   * Effective: can an app login role (`public`/`anon`/`authenticated`) EXECUTE
   * this function? `true` by default (Postgres grants EXECUTE to PUBLIC unless
   * revoked); `false` only when the PUBLIC default is revoked AND no app role is
   * granted back. Lets the audit-pairing check (#700) tell an app-reachable write
   * RPC from an internal helper that no app role can call.
   */
  readonly appExecutable: boolean;
  /** Effective: body of the LAST `create … function` for this signature. */
  readonly body: string;
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

// Read the function body that follows the `AS` clause at/after `fromIndex`
// (which the caller passes as the index just past the argument-list `)`).
// Supports dollar quoting `$tag$ … $tag$` (empty `$$` and named tags) and the
// legacy `AS '…'` form (with `''` escapes). Returns the inner body text with the
// delimiters removed plus `end` — the offset just past the closing delimiter, so
// the caller can read the post-body attribute clause (PostgreSQL allows
// `SECURITY DEFINER` / `SET search_path` / volatility either before OR after the
// body). When no body delimiter is found, `body` is "" and `end` is `fromIndex`.
// The caller passes comment-stripped text, so a `--`/`/* */` example can't
// masquerade as a body.
function readFunctionBody(
  text: string,
  fromIndex: number
): { body: string; end: number } {
  const rest = text.slice(fromIndex);
  const asMatch = /\bas\b\s*/i.exec(rest);
  if (!asMatch) return { body: "", end: fromIndex };
  const afterAs = fromIndex + asMatch.index + asMatch[0].length;
  const ch = text[afterAs];
  // Dollar-quoted: $tag$ … $tag$ (tag may be empty, e.g. `$$`).
  if (ch === "$") {
    const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(afterAs));
    if (!tagMatch) return { body: "", end: fromIndex };
    const tag = tagMatch[0]; // includes both surrounding `$`
    const bodyStart = afterAs + tag.length;
    const close = text.indexOf(tag, bodyStart);
    if (close === -1) return { body: text.slice(bodyStart), end: text.length };
    return { body: text.slice(bodyStart, close), end: close + tag.length };
  }
  // Single-quoted: 'body' with the '' escape.
  if (ch === "'") {
    let out = "";
    let i = afterAs + 1;
    for (; i < text.length; i++) {
      if (text[i] === "'" && text[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      if (text[i] === "'") break;
      out += text[i];
    }
    return { body: out, end: i + 1 };
  }
  return { body: "", end: fromIndex };
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
const GRANT_FN_RE =
  /\b(grant|revoke)\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+([a-z0-9_."]+)\s*\(/gi;
// Schema-wide grant: `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`
const GRANT_ALL_FN_RE =
  /\b(grant|revoke)\s+(?:all|execute)(?:\s+privileges)?\s+on\s+all\s+functions\s+in\s+schema\s+([a-z0-9_."]+)\s+(?:to|from)\s+([^;]+);/gi;
const DROP_FN_RE =
  /\bdrop\s+function\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi;

/**
 * Normalize a GRANT/REVOKE role list to bare lowercased role names. Takes only
 * the leading identifier of each comma-separated entry, so a `GROUP` modifier,
 * surrounding quotes (`"authenticated"`), or a trailing clause
 * (`authenticated WITH GRANT OPTION`, `public CASCADE`) cannot poison the role
 * token and make a real app-role grant read as a non-app role.
 */
function parseRoleList(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => {
      const m = /^\s*(?:group\s+)?"?([a-z_][a-z0-9_$]*)/i.exec(entry);
      return m ? m[1].toLowerCase() : "";
    })
    .filter((r) => r !== "");
}

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
    // The attribute clause can sit before the body (the repo's convention) OR
    // after it (`AS $$…$$ LANGUAGE plpgsql SECURITY DEFINER`, also valid). Read
    // both regions so the definer/search_path/volatility flags can't be evaded
    // by attribute order. The body itself is never scanned for these.
    const { body, end: bodyEnd } = readFunctionBody(text, end);
    const semi = text.indexOf(";", bodyEnd);
    const trailer = text.slice(bodyEnd, semi >= 0 ? semi : bodyEnd);
    const attrs = `${header} ${trailer}`;
    creates.push({
      signature: `${name}(${argTypes.join(",")})`,
      name,
      argTypes,
      isSecurityDefiner: /security\s+definer/i.test(attrs),
      pinsSearchPath: /set\s+search_path/i.test(attrs),
      returnsTrigger: /\breturns\s+(?:trigger|event_trigger)\b/i.test(attrs),
      isReadOnlyVolatility: /\b(?:stable|immutable)\b/i.test(attrs),
      body,
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

  const grants: GrantFunctionStatement[] = [];
  GRANT_FN_RE.lastIndex = 0;
  for (let m = GRANT_FN_RE.exec(text); m; m = GRANT_FN_RE.exec(text)) {
    const action = m[1].toLowerCase() as "grant" | "revoke";
    const name = m[2].replace(/"/g, "").toLowerCase();
    const open = text.indexOf("(", m.index);
    const { inner, end } = readBalancedParens(text, open);
    const argTypes = normalizeArgTypes(inner);
    // After the arg-list close comes `… TO|FROM role[, role …];`.
    const semi = text.indexOf(";", end);
    const tail = text.slice(end, semi >= 0 ? semi : text.length);
    const roleMatch = /\b(?:to|from)\s+([\s\S]+)$/i.exec(tail);
    grants.push({
      signature: `${name}(${argTypes.join(",")})`,
      allInSchema: null,
      name,
      action,
      roles: roleMatch ? parseRoleList(roleMatch[1]) : [],
      relPath: file.relPath,
      line: lineOf(file.text, m.index),
      pos: m.index,
    });
    GRANT_FN_RE.lastIndex = end;
  }

  // Schema-wide `… ON ALL FUNCTIONS IN SCHEMA <s> TO|FROM <roles>` grants apply
  // to every function that exists in the schema at the point they run — modelled
  // in the fold against the signatures created so far.
  GRANT_ALL_FN_RE.lastIndex = 0;
  for (let m = GRANT_ALL_FN_RE.exec(text); m; m = GRANT_ALL_FN_RE.exec(text)) {
    const schema = m[2].replace(/"/g, "").toLowerCase();
    grants.push({
      signature: null,
      allInSchema: schema,
      name: schema,
      action: m[1].toLowerCase() as "grant" | "revoke",
      roles: parseRoleList(m[3]),
      relPath: file.relPath,
      line: lineOf(file.text, m.index),
      pos: m.index,
    });
  }

  const drops: DropFunctionStatement[] = [];
  DROP_FN_RE.lastIndex = 0;
  for (let m = DROP_FN_RE.exec(text); m; m = DROP_FN_RE.exec(text)) {
    const name = m[1].replace(/"/g, "").toLowerCase();
    const open = text.indexOf("(", m.index);
    const { inner, end } = readBalancedParens(text, open);
    const argTypes = normalizeArgTypes(inner);
    drops.push({
      signature: `${name}(${argTypes.join(",")})`,
      name,
      relPath: file.relPath,
      line: lineOf(file.text, m.index),
      pos: m.index,
    });
    DROP_FN_RE.lastIndex = end;
  }

  return { creates, alters, grants, drops };
}

// App login roles whose EXECUTE access means a function is reachable from app
// code via the `.rpc()` path. `service_role` is excluded — it is confined to
// Edge Functions, never an app login (CLAUDE.md security posture).
const APP_EXECUTE_ROLES = new Set(["anon", "authenticated"]);

/** Folded EXECUTE privilege for one signature: does the PUBLIC default still hold? */
interface GrantState {
  /** PUBLIC has EXECUTE (the Postgres default until revoked). */
  publicHasExecute: boolean;
  /** Roles granted EXECUTE explicitly (beyond the PUBLIC default). */
  readonly explicit: Set<string>;
}

function applyGrantToSignature(
  state: Map<string, GrantState>,
  signature: string,
  action: "grant" | "revoke",
  roles: readonly string[]
) {
  let s = state.get(signature);
  if (!s) {
    // Postgres default: EXECUTE is granted to PUBLIC.
    s = { publicHasExecute: true, explicit: new Set() };
    state.set(signature, s);
  }
  for (const role of roles) {
    if (action === "grant") {
      if (role === "public") s.publicHasExecute = true;
      else s.explicit.add(role);
    } else {
      if (role === "public") s.publicHasExecute = false;
      else s.explicit.delete(role);
    }
  }
}

/**
 * Apply one GRANT/REVOKE to the grant state. A per-function grant touches its
 * signature; a schema-wide grant (`ON ALL FUNCTIONS IN SCHEMA <s>`) touches every
 * signature in `knownSignatures` that lives in that schema (the functions that
 * exist when the grant runs).
 */
function applyGrant(
  state: Map<string, GrantState>,
  g: GrantFunctionStatement,
  knownSignatures: Iterable<string>
) {
  if (g.allInSchema) {
    const prefix = `${g.allInSchema}.`;
    for (const sig of knownSignatures) {
      if (sig.startsWith(prefix)) {
        applyGrantToSignature(state, sig, g.action, g.roles);
      }
    }
    return;
  }
  if (g.signature) {
    applyGrantToSignature(state, g.signature, g.action, g.roles);
  }
}

function isAppExecutable(
  state: Map<string, GrantState>,
  signature: string
): boolean {
  const s = state.get(signature);
  // No grant/revoke seen → the PUBLIC default stands → app-executable.
  if (!s) return true;
  if (s.publicHasExecute) return true;
  for (const role of s.explicit) if (APP_EXECUTE_ROLES.has(role)) return true;
  return false;
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
  const grantState = new Map<string, GrantState>();

  for (const file of files) {
    const { creates, alters, grants, drops } = parseSqlFunctions(file);
    const ordered = [
      ...creates.map((c) => ({ pos: c.pos, kind: "create" as const, c })),
      ...alters.map((a) => ({ pos: a.pos, kind: "alter" as const, a })),
      ...grants.map((g) => ({ pos: g.pos, kind: "grant" as const, g })),
      ...drops.map((d) => ({ pos: d.pos, kind: "drop" as const, d })),
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
          returnsTrigger: c.returnsTrigger,
          isReadOnlyVolatility: c.isReadOnlyVolatility,
          // Provisional — recomputed from the folded grant state below.
          appExecutable: true,
          body: c.body,
          definedAt: `${c.relPath}:${c.line}`,
        });
      } else if (stmt.kind === "alter") {
        if (stmt.a.setsSearchPath) {
          const existing = state.get(stmt.a.signature);
          if (existing) {
            state.set(stmt.a.signature, { ...existing, pinsSearchPath: true });
          }
        }
      } else if (stmt.kind === "drop") {
        // Postgres DROP FUNCTION removes the function AND its grants. A later
        // CREATE of the same signature therefore starts from the default PUBLIC
        // EXECUTE — so reset both the definition and the folded grant state.
        state.delete(stmt.d.signature);
        grantState.delete(stmt.d.signature);
      } else {
        applyGrant(grantState, stmt.g, state.keys());
      }
    }
  }

  return [...state.values()].map((f) => ({
    ...f,
    appExecutable: isAppExecutable(grantState, f.signature),
  }));
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
