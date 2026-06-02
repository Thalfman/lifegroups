import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the SAC.5 bulk people-import migration (#165).
// CI has no Postgres, so these string assertions are the CI-runnable regression
// guard for the security-critical invariants of super_admin_bulk_import_people —
// composed from the shared migration-safety vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531040000_phase_sac5_people_import.sql");
});

describe("SAC.5 migration — super_admin_bulk_import_people", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_bulk_import_people");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(sql.lower).toContain("auth_role() <> 'super_admin'");
  });

  it("rejects a non-array payload with invalid_input", () => {
    expect(sql.lower).toContain("jsonb_typeof(p_rows) <> 'array'");
    expect(sql.lower).toContain("raise exception 'invalid_input'");
  });

  it("inserts leaders into profiles and members into members", () => {
    expect(sql.lower).toContain("insert into public.profiles");
    expect(sql.lower).toContain("insert into public.members");
    expect(sql.lower).toContain("v_role = 'leader'");
  });

  it("writes one paired audit_events row recording the created count", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_bulk_import_people",
      "'super_admin.bulk_import_people'"
    );
    expect(functionBody(sql, "super_admin_bulk_import_people")).toContain(
      "created_count"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_bulk_import_people");
  });
});
