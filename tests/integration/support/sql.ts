import { Client } from "pg";

// Raw-SQL escape hatch for the integration harness (issue #625).
//
// The action-pipeline atomic-rollback proof needs to install a TEST-ONLY trigger
// that fails the `audit_events` insert AFTER the `care_notes` row was inserted,
// so a non-transactional pairing would leak one row without the other. The
// Supabase JS client (REST/PostgREST) cannot run DDL, so this connects directly
// to the LOCAL stack's Postgres over the wire.
//
// SECURITY / SCOPE: this is harness-only DDL against a LOCAL CLI stack, like the
// fixture provisioning in support/fixtures.ts. It is never imported by any app
// runtime path (`app/**`, `lib/**`, `middleware.ts`) — `pg` is a devDependency.
// The trigger it installs is dropped again in the same test's teardown.

/**
 * The local Postgres connection string. Defaults to the Supabase CLI convention
 * (`postgres:postgres@127.0.0.1:54322/postgres`); override with `SUPABASE_DB_URL`
 * when the local stack exposes Postgres elsewhere.
 */
export function localDbUrl(): string {
  const override = (process.env.SUPABASE_DB_URL ?? "").trim();
  return override || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

/**
 * Run one or more SQL statements against the local stack and resolve when done.
 * Opens and closes its own connection so callers don't manage a pool. Throws on
 * any SQL error (e.g. a forced trigger raise) so the spec surfaces a clear cause.
 */
export async function runSql(sql: string): Promise<void> {
  const client = new Client({ connectionString: localDbUrl() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
