import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static assertions over the bulk-import created_count fix (#165 follow-up).
// CI has no Postgres, so these guard the correctness invariant (count rows
// actually written, not input rows) and confirm the security gate is intact.
// The security-critical invariants compose the shared migration-safety
// vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260602000000_fix_bulk_import_created_count.sql");
});

describe("bulk-import created_count fix migration", () => {
  it("re-defines the RPC as SECURITY DEFINER with a pinned search_path and super_admin gate", () => {
    assertSecurityDefiner(sql, "super_admin_bulk_import_people");
    // Negative gate (require, don't exclude) stays inline per the vocabulary.
    expect(sql.lower).toContain("auth_role() <> 'super_admin'");
  });

  it("counts rows actually written via GET DIAGNOSTICS ROW_COUNT", () => {
    expect(sql.lower).toContain("get diagnostics v_inserted = row_count");
    expect(sql.lower).toContain("v_created := v_created + v_inserted");
  });

  it("keeps the leader insert idempotent on the UNIQUE(email) constraint", () => {
    expect(sql.lower).toContain("insert into public.profiles");
    expect(sql.lower).toContain("on conflict do nothing");
  });

  it("leaves member dedup to the app layer (no DB unique constraint / no ON CONFLICT on members)", () => {
    const membersInsert = sql.lower.slice(
      sql.lower.indexOf("insert into public.members")
    );
    // The members insert must NOT carry an on-conflict clause — member dedup is
    // deliberately app-layer; a silent DB ON CONFLICT could drop distinct people.
    const untilSemicolon = membersInsert.slice(
      0,
      membersInsert.indexOf(";") + 1
    );
    expect(untilSemicolon).not.toContain("on conflict");
  });

  it("still writes exactly one paired audit_events row recording created_count", () => {
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
    assertExecuteLockdown(sql, "super_admin_bulk_import_people", "jsonb");
  });
});
