import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the admin-readable feature-flag RPC (#256).
// CI has no Postgres (RLS is verified manually), so these string assertions are
// the CI-runnable regression guard for the security-critical invariants: the
// read is a SECURITY DEFINER function with a pinned search_path, admits both
// admin roles via auth_is_admin(), returns ONLY the feature_flags sub-object
// (never the Super-Admin-only console copy / tracer), and locks EXECUTE down to
// authenticated. The shared vocabulary lives in ./migration-safety.ts.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260602030000_admin_read_feature_flags.sql");
});

describe("admin_read_feature_flags — admin-readable frozen-flag read", () => {
  it("defines admin_read_feature_flags as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_read_feature_flags");
  });

  it("admits both admin roles via auth_is_admin()", () => {
    expect(functionBody(sql, "admin_read_feature_flags")).toContain(
      "auth_is_admin()"
    );
  });

  it("returns only the feature_flags sub-object", () => {
    expect(functionBody(sql, "admin_read_feature_flags")).toContain(
      "setting_value -> 'feature_flags'"
    );
  });

  it("never exposes the Super-Admin-only console copy or tracer", () => {
    const body = functionBody(sql, "admin_read_feature_flags");
    expect(body).not.toContain("editable_copy");
    expect(body).not.toContain("console_tracer_note");
  });

  it("fails closed to an empty object for non-admins", () => {
    expect(functionBody(sql, "admin_read_feature_flags")).toContain(
      "else '{}'::jsonb"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_read_feature_flags");
  });
});
