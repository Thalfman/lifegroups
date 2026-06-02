import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Migration-content assertions for Concept Reconciliation §B (#190): retire the
// deprecated staff_viewer role. No live DB in unit tests, so — mirroring the
// other *-migration.test.ts files — we assert the migration SQL contains the
// load-bearing clauses, composing the shared migration-safety vocabulary for
// the audit invariant (see ./migration-safety.ts).
let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531140000_remove_staff_viewer_role.sql");
});

describe("remove staff_viewer migration (#190)", () => {
  it("is wrapped in a transaction", () => {
    expect(sql.raw).toMatch(/begin;/i);
    expect(sql.raw).toMatch(/commit;/i);
  });

  it("reassigns any existing staff_viewer rows to a no-access disabled state", () => {
    expect(sql.raw).toMatch(
      /update public\.profiles[\s\S]*set role = 'leader', status = 'inactive'/i
    );
    expect(sql.raw).toMatch(/where role = 'staff_viewer'/i);
  });

  it("audits each reassignment before mutating", () => {
    assertAuditContentFree(sql, {
      forbidden: [],
      required: ["system.migration.remove_staff_viewer"],
    });
  });

  it("neutralises auth_is_staff_viewer so the value can never resolve to access", () => {
    expect(sql.raw).toMatch(
      /create or replace function public\.auth_is_staff_viewer\(\)[\s\S]*select false;/i
    );
  });

  it("drops staff_viewer from the admin-or-staff read tier", () => {
    expect(sql.raw).toMatch(
      /create or replace function public\.auth_is_admin_or_staff\(\)[\s\S]*'super_admin','ministry_admin'\), false\)/i
    );
    // and the recreated body no longer lists staff_viewer
    expect(sql.raw).not.toMatch(
      /auth_is_admin_or_staff[\s\S]*'super_admin','ministry_admin','staff_viewer'/i
    );
  });

  it("neutralises in place — no DROP/CASCADE statements, no enum type-swap", () => {
    // The safety property: we neutralise via CREATE OR REPLACE rather than
    // dropping auth_role() (whose return type the RLS policy graph depends on).
    // Strip comment lines first so the assertion checks executable SQL, not the
    // explanatory prose (which discusses the rejected cascade approach).
    const executable = sql.raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/drop function/i);
    expect(executable).not.toMatch(/cascade/i);
    expect(executable).not.toMatch(/alter type public\.user_role rename/i);
  });
});
