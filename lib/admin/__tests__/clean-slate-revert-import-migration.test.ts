import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the PRD-SAC6 Clean Slate revert (#293) +
// export/import (#294) migration. CI has no Postgres, so these string
// assertions guard the security-critical invariants of the two restore RPCs and
// their shared restore body.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260603140000_phase_sac6_clean_slate_revert_import.sql"
  );
});

describe("SAC6 revert/import — shared restore body", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_clean_slate_restore_payload");
  });

  it("guards target_not_empty before inserting anything", () => {
    const body = functionBody(sql, "super_admin_clean_slate_restore_payload");
    expect(body).toContain("raise exception 'target_not_empty'");
    const guard = body.indexOf("raise exception 'target_not_empty'");
    const firstInsert = body.indexOf("insert into public.");
    expect(guard).toBeGreaterThan(-1);
    expect(firstInsert).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstInsert);
  });

  it("re-inserts parent → child (attendance_sessions before attendance_records)", () => {
    const body = functionBody(sql, "super_admin_clean_slate_restore_payload");
    const sessions = body.indexOf("insert into public.attendance_sessions");
    const records = body.indexOf("insert into public.attendance_records");
    expect(sessions).toBeGreaterThan(-1);
    expect(records).toBeGreaterThan(-1);
    expect(sessions).toBeLessThan(records);
  });

  it("re-inserts guests before follow_ups (FK linkage preserved)", () => {
    const body = functionBody(sql, "super_admin_clean_slate_restore_payload");
    expect(body.indexOf("insert into public.guests")).toBeLessThan(
      body.indexOf("insert into public.follow_ups")
    );
  });

  it("restores via jsonb_populate_recordset (extra columns ignored)", () => {
    const body = functionBody(sql, "super_admin_clean_slate_restore_payload");
    expect(body).toContain("jsonb_populate_recordset");
  });

  it("has no EXECUTE grant — it is an internal helper", () => {
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_clean_slate_restore_payload/
    );
    expect(sql.lower).toContain(
      "revoke all on function public.super_admin_clean_slate_restore_payload(jsonb) from authenticated"
    );
  });
});

describe("SAC6 revert — super_admin_clean_slate_revert", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_clean_slate_revert");
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the same advisory lock as the wipe", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
  });

  it("resolves the target snapshot for update", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "for update"
    );
  });

  it("raises missing_snapshot when there is none", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "raise exception 'missing_snapshot'"
    );
  });

  it("skips a snapshot that is already restored (idempotent)", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "if v_snapshot.restored_at is not null then"
    );
  });

  it("stamps restored_at / restored_by", () => {
    const body = functionBody(sql, "super_admin_clean_slate_revert");
    expect(body).toContain("set restored_at = now()");
    expect(body).toContain("restored_by = v_actor");
  });

  it("calls the shared restore body", () => {
    expect(functionBody(sql, "super_admin_clean_slate_revert")).toContain(
      "perform public.super_admin_clean_slate_restore_payload"
    );
  });

  it("writes one paired audit_events row for the revert", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_clean_slate_revert",
      "'super_admin.clean_slate_revert'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_clean_slate_revert", "uuid");
  });
});

describe("SAC6 import — super_admin_clean_slate_import", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_clean_slate_import");
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_clean_slate_import")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the clean_slate advisory lock", () => {
    expect(functionBody(sql, "super_admin_clean_slate_import")).toContain(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
  });

  it("validates schema_version = 1 (unsupported_snapshot_version)", () => {
    const body = functionBody(sql, "super_admin_clean_slate_import");
    expect(body).toContain("schema_version");
    expect(body).toContain("raise exception 'unsupported_snapshot_version'");
  });

  it("rejects non-array keys with malformed_snapshot", () => {
    const body = functionBody(sql, "super_admin_clean_slate_import");
    expect(body).toContain("jsonb_typeof");
    expect(body).toContain("raise exception 'malformed_snapshot'");
  });

  it("calls the shared restore body (same target_not_empty + insert order)", () => {
    expect(functionBody(sql, "super_admin_clean_slate_import")).toContain(
      "perform public.super_admin_clean_slate_restore_payload"
    );
  });

  it("writes one paired audit_events row for the import", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_clean_slate_import",
      "'super_admin.clean_slate_import'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_clean_slate_import", "jsonb");
  });
});
