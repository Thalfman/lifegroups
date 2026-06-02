import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

// Named, composable assertions for the security-critical invariants every
// admin migration must uphold. CI has no Postgres (RLS is verified manually per
// supabase/dev/README.md), so the migration suites guard these invariants as
// static substring/regex checks over the migration SQL text. Spelling each
// invariant out by hand in all ~16 suites lets the contract drift apart — one
// suite forgets a clause and nothing notices. This module is the single place
// that contract is named, so the suites compose it instead of re-spelling it.
//
// This is deliberately substring-based: real RLS enforcement lives in an
// env-gated DB-backed suite, and AST parsing is a separate, larger question.
//
// Known limits of the substring approach (none hit by current migrations, but
// worth knowing before reusing): function bodies are sliced on a tight `$$;`
// closer, and EXECUTE-lockdown signatures must be paren-free (no typmods like
// `numeric(10,2)`).

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url)
);

export interface MigrationSql {
  /** The migration's file name, surfaced in assertion failure messages. */
  readonly fileName: string;
  /** Raw SQL text, unmodified. */
  readonly raw: string;
  /** Lowercased SQL, for case-insensitive substring / regex checks. */
  readonly lower: string;
}

/** Wrap raw SQL as a {@link MigrationSql}. Useful for unit-testing assertions. */
export function migrationFromSql(
  raw: string,
  fileName = "<inline>"
): MigrationSql {
  return { fileName, raw, lower: raw.toLowerCase() };
}

/** Read a migration from `supabase/migrations/` by file name. */
export function loadMigration(fileName: string): MigrationSql {
  return migrationFromSql(
    readFileSync(join(MIGRATIONS_DIR, fileName), "utf8"),
    fileName
  );
}

/**
 * The lowercased body of the function `public.<name>`, sliced from its
 * `create [or replace] function public.<name>(` header to the `$$;` that closes
 * it. Anchoring on the CREATE (not just any `function public.<name>`) means a
 * preceding `drop function ...` or a GRANT/REVOKE referencing the name is not
 * mistaken for the definition. The trailing `(` keeps a name that is a prefix
 * of another function (e.g. `foo` vs `foo_v2`) from colliding. Fails the test
 * if the function is not defined.
 */
export function functionBody(sql: MigrationSql, fnName: string): string {
  const start = sql.lower.search(
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegExp(fnName)}\\s*\\(`
    )
  );
  expect(
    start,
    `${fnName} should be defined in ${sql.fileName}`
  ).toBeGreaterThan(-1);
  const end = sql.lower.indexOf("$$;", start);
  return sql.lower.slice(start, end === -1 ? undefined : end);
}

/**
 * Every `insert into public.audit_events ...` statement, each sliced to the
 * `return` that follows it, so content-free-audit checks can inspect exactly
 * what each mutation records.
 */
export function auditEventInserts(sql: MigrationSql): string[] {
  const blocks: string[] = [];
  const haystack = sql.lower;
  let from = 0;
  for (;;) {
    const start = haystack.indexOf("insert into public.audit_events", from);
    if (start === -1) break;
    const end = haystack.indexOf("return ", start);
    blocks.push(haystack.slice(start, end === -1 ? undefined : end));
    from = start + 1;
  }
  return blocks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Function name + arg list. With no `argList`, `[^)]*` spans any arg list (the
// signatures hold no nested parens, so it safely covers the multi-line lists the
// GRANT block sometimes wraps across). Pass `argList` (the comma-separated arg
// types, e.g. `"jsonb"` or `"uuid, integer"`) to pin a specific overload —
// whitespace around the commas and inside the parens is tolerated.
function fnSignature(fnName: string, argList?: string): string {
  const name = `public\\.${escapeRegExp(fnName)}`;
  if (argList === undefined) {
    return `${name}\\s*\\([^)]*\\)`;
  }
  const args = argList
    .toLowerCase()
    .split(",")
    .map((arg) => escapeRegExp(arg.trim()))
    .join("\\s*,\\s*");
  return `${name}\\s*\\(\\s*${args}\\s*\\)`;
}

/**
 * A function runs as SECURITY DEFINER with an injection-safe pinned
 * search_path. The pin defaults to `public, pg_temp` — the form every admin
 * write RPC ships — but `options.searchPath` overrides it for the rare helper
 * that pins a different value (e.g. the over_shepherd coverage read helper pins
 * `public`). Pass the value exactly as it appears after `set search_path = `.
 */
export function assertSecurityDefiner(
  sql: MigrationSql,
  fnName: string,
  options: { searchPath?: string } = {}
): void {
  const { searchPath = "public, pg_temp" } = options;
  const body = functionBody(sql, fnName);
  expect(body, `${fnName} should be SECURITY DEFINER`).toContain(
    "security definer"
  );
  // Match the pin as the COMPLETE search_path value, not a prefix: a shorter
  // expected value must not accept a broader pin, or an unintended extra schema
  // slips into a SECURITY DEFINER function's path. `\s*,\s*` between schemas
  // tolerates whitespace either side of the comma (Postgres allows it), and the
  // trailing `(?!\s*,)(?!\w)` ends the match at the last schema — rejecting a
  // continued list (`public , pg_temp`) and a longer schema name (`publicx`).
  const pin = searchPath
    .toLowerCase()
    .split(",")
    .map((part) => escapeRegExp(part.trim()))
    .join("\\s*,\\s*");
  expect(body, `${fnName} should pin search_path to ${searchPath}`).toMatch(
    new RegExp(`set search_path = ${pin}(?!\\s*,)(?!\\w)`)
  );
}

/**
 * A function gates execution on a specific role via `auth_role() = '<role>'`
 * inside its body — e.g. the ministry_admin-only RPCs. Negative gates such as
 * `auth_role() <> 'super_admin'` are a different invariant (require, don't
 * exclude) and stay asserted inline in the suite that needs them.
 */
export function assertRoleGate(
  sql: MigrationSql,
  fnName: string,
  role: string
): void {
  expect(
    functionBody(sql, fnName),
    `${fnName} should gate on auth_role() = '${role}'`
  ).toContain(`auth_role() = '${role.toLowerCase()}'`);
}

/**
 * A function writes a paired `audit_events` row inside its own body — the same
 * transaction as the mutation. Pass `action` to also assert the recorded action
 * label as it appears in the SQL: pass the quoted literal
 * (`"'super_admin.set_profile_status'"`) so the surrounding quotes pin it to the
 * recorded value rather than matching an arbitrary substring.
 */
export function assertPairedAuditInsert(
  sql: MigrationSql,
  fnName: string,
  action?: string
): void {
  const body = functionBody(sql, fnName);
  expect(body, `${fnName} should write a paired audit_events row`).toContain(
    "insert into public.audit_events"
  );
  if (action) {
    expect(body, `${fnName} audit should record action ${action}`).toContain(
      action.toLowerCase()
    );
  }
}

const REVOKED_ROLES = ["public", "anon", "authenticated"] as const;

/**
 * EXECUTE on a function is revoked from public / anon / authenticated and then
 * granted only to authenticated — the "deny by default, allow authenticated"
 * lockdown every admin RPC ships. Whitespace-tolerant, so the suites need not
 * track the migrations' GRANT-block column alignment. Both revoke styles the
 * migrations use are accepted: one role per statement (`... from public; ...
 * from anon; ... from authenticated;`) and the combined list (`... from public,
 * anon, authenticated;`) — revoking from more roles never weakens the lockdown.
 * Two further traps are guarded: every EXECUTE grant must name *exactly*
 * `authenticated` (no comma-listed extras like `authenticated, public` and no
 * other role such as `service_role`), and the grant must come AFTER the revoke
 * from authenticated (a grant that precedes its revoke leaves the RPC
 * un-executable).
 *
 * Pass `argList` (the comma-separated arg types, e.g. `"jsonb"`) to pin a
 * specific overload, so the lockdown is asserted for exactly the RPC the app
 * calls and not for some other same-named overload.
 */
export function assertExecuteLockdown(
  sql: MigrationSql,
  fnName: string,
  argList?: string
): void {
  const signature = fnSignature(fnName, argList);

  // Collect every `revoke all on function <fn>(...) from <grantees>;` for this
  // function and union the grantees. The `[^;]*` stays within one statement, so
  // a combined `from public, anon, authenticated` lands as one match whose list
  // we split — and the per-role presence check below is style-agnostic.
  const revokes = [
    ...sql.lower.matchAll(
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+${signature}\\s+from\\s+([^;]*);`,
        "g"
      )
    ),
  ];
  const revokeGrantees = (match: RegExpMatchArray): string[] =>
    match[1].split(",").map((role) => role.replace(/\s+/g, " ").trim());
  const revokedRoles = new Set(revokes.flatMap(revokeGrantees));
  for (const role of REVOKED_ROLES) {
    expect(
      revokedRoles.has(role),
      `${fnName} should revoke EXECUTE from ${role}`
    ).toBe(true);
  }

  // Collect every `grant execute ... to <grantees>;` for this function and
  // require each grantee list to be exactly `authenticated`. The `[^;]*` stays
  // within one statement (stops at its terminating `;`), so a comma-listed or
  // additional role is caught by the exact-equality check below.
  const grants = [
    ...sql.lower.matchAll(
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+${signature}\\s+to\\s+([^;]*);`,
        "g"
      )
    ),
  ];
  expect(
    grants.length,
    `${fnName} should grant EXECUTE to authenticated`
  ).toBeGreaterThan(0);
  for (const grant of grants) {
    expect(
      grant[1].replace(/\s+/g, " ").trim(),
      `${fnName} EXECUTE must be granted only to authenticated`
    ).toBe("authenticated");
  }

  // The grant must follow the revoke from authenticated; otherwise the revoke
  // wins and the RPC ends up un-executable to authenticated users.
  const revokeFromAuth = revokes.find((match) =>
    revokeGrantees(match).includes("authenticated")
  );
  expect(
    grants[0].index ?? -1,
    `${fnName} should grant EXECUTE only after revoking it from authenticated`
  ).toBeGreaterThan(revokeFromAuth?.index ?? -1);
}

/**
 * The migration never calls `auth_is_admin()` — that helper admits the
 * super_admin, so avoiding it is how a migration keeps super_admin out (e.g.
 * the creator-scoped private care notes, gated on `ministry_admin` instead).
 */
export function assertExcludesSuperAdmin(sql: MigrationSql): void {
  expect(
    sql.lower,
    `${sql.fileName} should not use auth_is_admin() — it admits super_admin`
  ).not.toContain("auth_is_admin");
}

/**
 * The audit trail records presence / labels only: at least one audit row is
 * written, none of the `forbidden` tokens (ciphertext, key material, PII) leak
 * into it, and any `required` tokens (e.g. `has_body`) are present.
 */
export function assertAuditContentFree(
  sql: MigrationSql,
  options: { forbidden: string[]; required?: string[] }
): void {
  const blocks = auditEventInserts(sql);
  expect(
    blocks.length,
    `${sql.fileName} should write at least one audit_events row`
  ).toBeGreaterThan(0);
  const joined = blocks.join("\n");
  for (const token of options.required ?? []) {
    expect(joined, `audit should record ${token}`).toContain(
      token.toLowerCase()
    );
  }
  for (const token of options.forbidden) {
    expect(joined, `audit must not contain ${token}`).not.toContain(
      token.toLowerCase()
    );
  }
}
