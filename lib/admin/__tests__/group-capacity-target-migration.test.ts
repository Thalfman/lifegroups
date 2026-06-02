import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Capacity & Multiplication #185: static boundary assertions over the migration
// that adds the set-group-target RPC. CI has no Postgres, so this guard pins the
// "one visible source of truth" invariant: the RPC writes groups.capacity AND
// clears any capacity_override, on the audited SECURITY DEFINER write path. The
// security-critical invariants compose the shared migration-safety vocabulary
// (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531120000_julian_cap3_group_capacity_target.sql");
});

describe("set group capacity target migration", () => {
  it("declares the RPC as SECURITY DEFINER with a pinned search_path + admin guard", () => {
    assertSecurityDefiner(sql, "admin_set_group_capacity_target");
    const body = functionBody(sql, "admin_set_group_capacity_target");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("writes the effective target source: sets groups.capacity AND clears any override", () => {
    expect(sql.lower).toMatch(
      /update public\.groups\s+set capacity = p_target/
    );
    expect(sql.lower).toContain("set capacity_override = null");
  });

  it("leaves allow_over_capacity / exclude_from_capacity_metrics untouched", () => {
    expect(sql.lower).not.toContain("set allow_over_capacity");
    expect(sql.lower).not.toContain("set exclude_from_capacity_metrics");
  });

  it("bounds the target and pairs the write with an audit_events row", () => {
    expect(sql.lower).toMatch(/p_target < 1 or p_target > 500/);
    assertPairedAuditInsert(
      sql,
      "admin_set_group_capacity_target",
      "'admin.set_group_capacity_target'"
    );
  });

  it("grants execute to authenticated only and does not service-role write", () => {
    assertExecuteLockdown(sql, "admin_set_group_capacity_target");
    expect(sql.lower).not.toContain("service_role");
  });
});
