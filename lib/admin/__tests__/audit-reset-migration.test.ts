import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the PRD-SAC6 audit-log reset migration
// (#290). CI has no Postgres, so these string assertions guard the
// security-critical invariants of super_admin_reset_audit_logs + the
// audit_events_archive RLS.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260603140000_phase_sac6_reset_audit_logs.sql");
});

describe("SAC6 migration — audit_events_archive table", () => {
  it("enables RLS with a single super-admin SELECT policy and no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.audit_events_archive enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_role() = 'super_admin')"
    );
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+insert/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+update/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+delete/);
  });

  it("grants only SELECT on the archive to authenticated", () => {
    expect(sql.lower).toContain(
      "grant  select on public.audit_events_archive to authenticated"
    );
  });
});

describe("SAC6 migration — super_admin_reset_audit_logs", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_reset_audit_logs");
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_reset_audit_logs")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("archives current audit rows BEFORE purging them (archive-then-purge)", () => {
    const body = functionBody(sql, "super_admin_reset_audit_logs");
    const archiveInsert = body.indexOf(
      "insert into public.audit_events_archive"
    );
    const purge = body.indexOf("delete from public.audit_events");
    expect(archiveInsert).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(-1);
    expect(archiveInsert).toBeLessThan(purge);
  });

  it("writes one fresh paired audit row recording the prior count", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_reset_audit_logs",
      "'super_admin.reset_audit_logs'"
    );
    expect(functionBody(sql, "super_admin_reset_audit_logs")).toContain(
      "archived_count"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_reset_audit_logs");
  });
});
