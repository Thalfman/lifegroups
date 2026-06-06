import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the readiness-rule + per-cell-overrides
// migration (#402). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants of the two new write
// paths: the GLOBAL rule upsert (admin_set_readiness_rule) and the per-cell
// trigger-overrides upsert (admin_set_cell_trigger_overrides). Both must be
// audited SECURITY DEFINER with the EXECUTE lockdown.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260615000000_phase_groups5_readiness_rule_and_overrides.sql"
  );
});

describe("readiness-rule migration — global rule table + RPC", () => {
  it("references #402 and the PRD in the documentary header", () => {
    expect(sql.raw).toContain("#402");
    expect(sql.lower).toContain("settings_groups_and_triggers_prd");
  });

  it("creates the multiplication_readiness_rule table, one row per ministry year", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.multiplication_readiness_rule"
    );
    expect(sql.lower).toContain(
      "constraint multiplication_readiness_rule_year_unique"
    );
    expect(sql.lower).toContain("jsonb_typeof(rule) = 'object'");
  });

  it("admin-only RLS read on the rule table", () => {
    expect(sql.lower).toContain(
      "create policy multiplication_readiness_rule_admin_read"
    );
    expect(sql.lower).toContain("using (public.auth_is_admin())");
  });

  it("admin_set_readiness_rule is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_readiness_rule");
  });

  it("guards on auth_is_admin(), validates the year + object rule, upserts on the year", () => {
    const body = functionBody(sql, "admin_set_readiness_rule");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
    expect(body).toContain("jsonb_typeof(p_rule) <> 'object'");
    expect(body).toContain("on conflict (ministry_year) do update");
  });

  it("writes a paired audit_events row for the rule write", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_readiness_rule",
      "'admin.set_readiness_rule'"
    );
  });

  it("locks EXECUTE down to authenticated only on admin_set_readiness_rule", () => {
    assertExecuteLockdown(sql, "admin_set_readiness_rule", "integer, jsonb");
  });
});

describe("readiness-rule migration — per-cell overrides RPC", () => {
  it("admin_set_cell_trigger_overrides is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_cell_trigger_overrides");
  });

  it("guards on auth_is_admin(), validates the type + object overrides, requires a live category", () => {
    const body = functionBody(sql, "admin_set_cell_trigger_overrides");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain(
      "p_audience_category not in ('men','women','mixed')"
    );
    expect(body).toContain("jsonb_typeof(p_overrides) <> 'object'");
    // The cell can only override a live (non-archived) category.
    expect(body).toContain("from public.group_categories");
    expect(body).toContain("archived_at is null");
  });

  it("upserts trigger_overrides on the (audience_category, category) conflict target", () => {
    const body = functionBody(sql, "admin_set_cell_trigger_overrides");
    expect(body).toContain(
      "on conflict (audience_category, category_id) do update"
    );
    expect(body).toContain(
      "set trigger_overrides = excluded.trigger_overrides"
    );
  });

  it("writes a paired audit_events row for the overrides write", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_cell_trigger_overrides",
      "'admin.set_cell_trigger_overrides'"
    );
    const body = functionBody(sql, "admin_set_cell_trigger_overrides");
    expect(body).toContain("'category_type_target'");
  });

  it("locks EXECUTE down to authenticated only on admin_set_cell_trigger_overrides", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_cell_trigger_overrides",
      "uuid, text, jsonb"
    );
  });
});
