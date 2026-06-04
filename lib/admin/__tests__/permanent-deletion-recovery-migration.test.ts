import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#315): static boundary assertions over the tombstone-restore RPC.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604040000_phase_sad4_permanent_deletion_recovery.sql"
  );
});

describe("SAD4 — super_admin_restore_tombstone", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_restore_tombstone");
  });

  it("gates on super_admin", () => {
    expect(functionBody(sql, "super_admin_restore_tombstone")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("resolves the tombstone for update and raises missing_tombstone", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("from public.tombstones");
    expect(body).toContain("for update");
    expect(body).toContain("raise exception 'missing_tombstone'");
  });

  it("refuses an id that exists again (no silent overwrite)", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("raise exception 'id_already_exists'");
  });

  it("maps a missing parent to a clean token", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("when foreign_key_violation then");
    expect(body).toContain("raise exception 'missing_parent'");
  });

  it("re-inserts the row from its snapshot via jsonb_populate_record", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("jsonb_populate_record");
    expect(body).toContain("row_snapshot");
  });

  it("re-links the captured set-null dependents, best-effort with counts", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("set_null_dependents");
    expect(body).toContain("get diagnostics v_updated = row_count");
    expect(body).toContain("v_relinked");
    expect(body).toContain("v_skipped");
  });

  it("retains the tombstone after restore (stamps restored_at/by, no delete)", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("set restored_at = now()");
    expect(body).toContain("restored_by = v_actor");
    expect(body).not.toContain("delete from public.tombstones");
  });

  it("writes one paired audit_events row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_restore_tombstone",
      "'super_admin.restore_tombstone'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_restore_tombstone", "uuid");
  });
});
