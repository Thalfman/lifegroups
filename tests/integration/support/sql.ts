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
// runtime path (`app/**`, `lib/**`, `proxy.ts`) — `pg` is a devDependency.
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

/** True only for a loopback Postgres host. */
function hostIsLocal(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Open a connection to the LOCAL stack's Postgres, refusing anything else.
 * `resolveIntegrationEnv()` only proves the Supabase API URL is local;
 * `SUPABASE_DB_URL` is a separate override, so guard it here too — this
 * harness runs raw SQL (including DDL), which must never touch a
 * staging/production database.
 */
async function connectLocal(): Promise<Client> {
  const url = localDbUrl();
  if (!hostIsLocal(url)) {
    throw new Error(
      "Refusing to run integration SQL: SUPABASE_DB_URL is not a local " +
        "Postgres host (expected localhost / 127.0.0.1 / ::1). This harness " +
        "runs raw SQL (including DDL) and must never touch a remote database."
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * Run one or more SQL statements against the local stack and resolve when done.
 * Opens and closes its own connection so callers don't manage a pool. Throws on
 * any SQL error (e.g. a forced trigger raise) so the spec surfaces a clear cause.
 *
 * REFUSES a non-local connection string (see {@link connectLocal}).
 */
export async function runSql(sql: string): Promise<void> {
  const client = await connectLocal();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Run a single (optionally parameterised) query against the local stack and
 * return its rows. Read-only companion to {@link runSql} for specs that need
 * to INSPECT the live schema/catalogs (e.g. the types-drift guard, #864)
 * rather than fire DDL. Same local-only guard; opens and closes its own
 * connection.
 */
export async function queryRows<T>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await connectLocal();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}
