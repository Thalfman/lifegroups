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
// closer; EXECUTE-lockdown signatures must be paren-free (no typmods like
// `numeric(10,2)`); and the CREATE is assumed to precede any GRANT/REVOKE of
// the same function name.

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
 * The lowercased body of the function `public.<name>`, sliced from the first
 * `function public.<name>(` occurrence (its definition — the CREATE precedes
 * any GRANT/REVOKE) to the `$$;` that closes it. Fails the test if the function
 * is not defined. The trailing `(` anchors the match so a name that is a prefix
 * of another function (e.g. `foo` vs `foo_v2`) does not collide.
 */
export function functionBody(sql: MigrationSql, fnName: string): string {
  const start = sql.lower.indexOf(`function public.${fnName}(`);
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

// Function name + arg list. The signatures hold no nested parens, so `[^)]*`
// safely spans the multi-line arg lists the GRANT block sometimes wraps across.
function fnSignature(fnName: string): string {
  return `public\\.${escapeRegExp(fnName)}\\s*\\([^)]*\\)`;
}

/**
 * A function runs as SECURITY DEFINER with the injection-safe pinned
 * search_path (`public, pg_temp`).
 */
export function assertSecurityDefiner(sql: MigrationSql, fnName: string): void {
  const body = functionBody(sql, fnName);
  expect(body, `${fnName} should be SECURITY DEFINER`).toContain(
    "security definer"
  );
  expect(body, `${fnName} should pin search_path to public, pg_temp`).toContain(
    "set search_path = public, pg_temp"
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
 * track the migrations' GRANT-block column alignment.
 */
export function assertExecuteLockdown(sql: MigrationSql, fnName: string): void {
  const signature = fnSignature(fnName);
  for (const role of REVOKED_ROLES) {
    expect(sql.lower, `${fnName} should revoke EXECUTE from ${role}`).toMatch(
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+${signature}\\s+from\\s+${role}`
      )
    );
  }
  expect(sql.lower, `${fnName} should grant EXECUTE to authenticated`).toMatch(
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+${signature}\\s+to\\s+authenticated`
    )
  );
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
