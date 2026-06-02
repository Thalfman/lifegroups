import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the SAC.3 account-management migration (#163).
// CI has no Postgres, so these string assertions are the CI-runnable regression
// guard for the security-critical invariants of the two RPCs — composed from
// the shared migration-safety vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531020000_phase_sac3_account_management.sql");
});

describe("SAC.3 migration — super_admin_set_profile_status", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    expect(sql.lower).toContain(
      "create or replace function public.super_admin_set_profile_status"
    );
    assertSecurityDefiner(sql, "super_admin_set_profile_status");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(sql.lower).toContain("auth_role() <> 'super_admin'");
  });

  it("constrains status to active/inactive", () => {
    expect(sql.lower).toContain("not in ('active', 'inactive')");
  });

  it("blocks self-target and the bootstrap super_admin", () => {
    expect(sql.lower).toContain("self_target_not_allowed");
    expect(sql.lower).toContain("forbidden_target");
  });

  it("writes a paired audit_events row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_set_profile_status",
      "'super_admin.set_profile_status'"
    );
  });
});

describe("SAC.3 migration — super_admin_log_password_reset", () => {
  it("defines the audit-only RPC behind the super-admin gate", () => {
    expect(sql.lower).toContain(
      "create or replace function public.super_admin_log_password_reset"
    );
    assertSecurityDefiner(sql, "super_admin_log_password_reset");
    assertPairedAuditInsert(
      sql,
      "super_admin_log_password_reset",
      "'super_admin.request_password_reset'"
    );
  });

  it("locks both functions' EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_set_profile_status");
    assertExecuteLockdown(sql, "super_admin_log_password_reset");
  });
});
