import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the PRD-SAC6 Clean Slate migration (#288).
// CI has no Postgres, so these string assertions guard the security-critical
// invariants of super_admin_clean_slate_wipe + the clean_slate_snapshots RLS.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260603130000_phase_sac6_clean_slate_history_wipe.sql");
});

describe("SAC6 migration — clean_slate_snapshots table", () => {
  it("enables RLS with a single super-admin SELECT policy and no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.clean_slate_snapshots enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_role() = 'super_admin')"
    );
    // No INSERT/UPDATE/DELETE policy: writes flow only through the RPC.
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+insert/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+update/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+delete/);
  });

  it("grants only SELECT on the table to authenticated", () => {
    expect(sql.lower).toContain(
      "grant  select on public.clean_slate_snapshots to authenticated"
    );
  });
});

describe("SAC6 migration — super_admin_clean_slate_wipe", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_clean_slate_wipe");
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_clean_slate_wipe")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes with an advisory transaction lock", () => {
    expect(functionBody(sql, "super_admin_clean_slate_wipe")).toContain(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
  });

  it("raises nothing_to_wipe when there is nothing to clear", () => {
    expect(functionBody(sql, "super_admin_clean_slate_wipe")).toContain(
      "raise exception 'nothing_to_wipe'"
    );
  });

  it("captures the snapshot BEFORE deleting any history", () => {
    const body = functionBody(sql, "super_admin_clean_slate_wipe");
    const snapshotInsert = body.indexOf(
      "insert into public.clean_slate_snapshots"
    );
    const firstDelete = body.indexOf("delete from public.attendance_records");
    expect(snapshotInsert).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(-1);
    expect(snapshotInsert).toBeLessThan(firstDelete);
  });

  it("deletes attendance_records explicitly (CASCADE is count-invisible)", () => {
    expect(functionBody(sql, "super_admin_clean_slate_wipe")).toContain(
      "delete from public.attendance_records"
    );
  });

  it("records schema_version in the snapshot payload", () => {
    expect(functionBody(sql, "super_admin_clean_slate_wipe")).toContain(
      "'schema_version', 1"
    );
  });

  it("writes one paired audit_events row for the wipe", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_clean_slate_wipe",
      "'super_admin.clean_slate_wipe'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_clean_slate_wipe");
  });
});
