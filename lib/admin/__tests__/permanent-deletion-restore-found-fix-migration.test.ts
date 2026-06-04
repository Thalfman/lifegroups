import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#315 follow-up): the restore id-conflict guard must use
// EXECUTE..INTO, not FOUND. A bare EXECUTE does not set FOUND, and the preceding
// `select * into v_tomb` left FOUND true — so the original `if found` guard
// raised id_already_exists on EVERY restore.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604070000_phase_sad7_restore_found_fix.sql");
});

describe("SAD7 — restore FOUND fix", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_restore_tombstone");
  });

  it("probes id existence with EXECUTE..INTO, not FOUND", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("into v_exists");
    expect(body).toContain("if v_exists is not null then");
    expect(body).toContain("raise exception 'id_already_exists'");
    // The broken FOUND guard must be gone from this version.
    expect(body).not.toContain("if found then");
  });

  it("keeps the unique_violation / missing_parent mapping + best-effort relink", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("when unique_violation then");
    expect(body).toContain("when foreign_key_violation then");
    expect(body).toContain("get diagnostics v_updated = row_count");
  });

  it("retains the tombstone and writes one paired audit row", () => {
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toContain("set restored_at = now()");
    expect(body).not.toContain("delete from public.tombstones");
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
