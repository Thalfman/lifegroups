import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the SAC.2 feature-flags + editable-copy
// migration (#161 / #162). CI has no Postgres (RLS is verified manually), so
// these string assertions are the CI-runnable regression guard for the
// security-critical invariants: the platform-config write is re-created as a
// SECURITY DEFINER function, gates on auth_role() = 'super_admin', whitelists
// the feature_flags and editable_copy blocks, deep-merges them, and writes a
// paired audit_events row. The security-critical invariants compose the shared
// migration-safety vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531010000_phase_sac2_feature_flags_and_copy.sql");
});

describe("SAC.2 migration — audited super-admin platform-config write", () => {
  it("defines super_admin_set_platform_config as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_set_platform_config");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(sql.lower).toContain("auth_role() <> 'super_admin'");
  });

  it("resolves the actor server-side", () => {
    expect(sql.lower).toContain("auth_profile_id()");
  });

  it("whitelists feature_flags and editable_copy in addition to the tracer", () => {
    expect(sql.lower).toContain("'feature_flags'");
    expect(sql.lower).toContain("'editable_copy'");
    expect(sql.lower).toContain("'console_tracer_note'");
  });

  it("deep-merges the submitted sub-keys rather than clobbering", () => {
    expect(sql.lower).toContain("-> 'feature_flags', '{}'::jsonb) || v_flags");
    expect(sql.lower).toContain("-> 'editable_copy', '{}'::jsonb) || v_copy");
  });

  it("raises invalid_input on malformed payloads", () => {
    expect(sql.lower).toContain("raise exception 'invalid_input'");
  });

  it("writes a paired audit_events row recording only submitted keys", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_set_platform_config",
      "'super_admin.set_platform_config'"
    );
    expect(functionBody(sql, "super_admin_set_platform_config")).toContain(
      "submitted_keys"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_set_platform_config");
  });
});
