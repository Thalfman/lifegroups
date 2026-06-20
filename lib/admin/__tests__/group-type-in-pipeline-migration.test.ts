import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// PRD #751 / slice #755 (ADR 0030) — static boundary assertions over the
// migration that adds the type-level `in_pipeline` intent flag to
// group_type_configs plus the audited admin_set_group_type_in_pipeline RPC. CI
// has no Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the CI-runnable regression guard that the column is
// additive + defaulting and the flag flip stays an audited SECURITY DEFINER write
// with the EXECUTE lockdown — never a hard delete.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260712000000_group_type_in_pipeline.sql");
});

describe("in_pipeline migration — additive, defaulting column", () => {
  it("adds in_pipeline as NOT NULL DEFAULT false with `add column if not exists`", () => {
    expect(sql.lower).toContain(
      "add column if not exists in_pipeline boolean not null default false"
    );
  });

  it("does not drop or rewrite the group_type_configs table (additive only)", () => {
    expect(sql.lower).not.toContain("drop table");
    expect(sql.lower).not.toMatch(/delete\s+from\s+public\.group_type_configs/);
  });
});

describe("admin_set_group_type_in_pipeline — audited SECURITY DEFINER write", () => {
  it("defines the 2-arg RPC (text, boolean)", () => {
    expect(sql.lower).toContain(
      "create function public.admin_set_group_type_in_pipeline("
    );
    expect(sql.lower).toContain("p_in_pipeline boolean");
  });

  it("is SECURITY DEFINER with a pinned search_path and the admin guard", () => {
    assertSecurityDefiner(sql, "admin_set_group_type_in_pipeline");
    const body = functionBody(sql, "admin_set_group_type_in_pipeline");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("upserts keyed on the normalized type, serialized by a per-key advisory lock", () => {
    const body = functionBody(sql, "admin_set_group_type_in_pipeline");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("hashtext('group_type_configs')");
    expect(body).toContain("lower(btrim(group_type)) = lower(v_type)");
  });

  it("writes a paired audit_events row with before/after intent", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_group_type_in_pipeline",
      "'admin.set_group_type_in_pipeline'"
    );
    const body = functionBody(sql, "admin_set_group_type_in_pipeline");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("removal is a soft flag flip, never a hard delete; no service role", () => {
    const body = functionBody(sql, "admin_set_group_type_in_pipeline");
    expect(body).not.toMatch(/delete\s+from/);
    expect(sql.lower).not.toContain("service_role");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_group_type_in_pipeline",
      "text, boolean"
    );
  });
});
