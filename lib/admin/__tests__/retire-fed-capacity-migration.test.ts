import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the retire-fed-capacity migration (#401). CI has
// no Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the runnable regression guard for the security-
// critical invariants of the recreated write path AND the column/argument removal:
// the fed_capacity column is dropped, admin_set_multiplication_config is recreated
// WITHOUT p_fed_capacity (old overload dropped first), and the audited SECURITY
// DEFINER + EXECUTE-lockdown conventions are preserved.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260614000000_phase_groups4_retire_fed_capacity.sql");
});

describe("retire-fed-capacity migration — drops the fed_capacity column", () => {
  it("drops the fed_capacity column and its object-shape check", () => {
    expect(sql.lower).toContain(
      "drop constraint if exists multiplication_config_fed_capacity_is_object"
    );
    expect(sql.lower).toContain("drop column if exists fed_capacity");
  });

  it("references #401 and the PRD in the documentary header", () => {
    expect(sql.raw).toContain("#401");
    expect(sql.lower).toContain("settings_groups_and_triggers_prd");
  });

  it("notes the overflow threshold band is no longer read", () => {
    expect(sql.lower).toContain("overflow");
    expect(sql.lower).toContain("no longer read");
  });
});

describe("retire-fed-capacity migration — recreates the write path without p_fed_capacity", () => {
  it("drops the old 5-arg overload before recreating", () => {
    expect(sql.lower).toContain(
      "drop function if exists public.admin_set_multiplication_config("
    );
    expect(sql.lower).toContain("text, integer, jsonb, jsonb, jsonb");
  });

  it("recreates admin_set_multiplication_config with a 4-arg signature", () => {
    // The recreated function takes thresholds + trigger only, no fed capacity.
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).not.toContain("p_fed_capacity");
    expect(body).toContain("jsonb_typeof(p_thresholds) <> 'object'");
    expect(body).toContain("jsonb_typeof(p_trigger) <> 'object'");
  });

  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_multiplication_config");
  });

  it("guards on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("upserts on the (group_type, ministry_year) conflict target", () => {
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("on conflict (group_type, ministry_year) do update");
  });

  it("writes a paired audit_events row, no longer mentioning fed capacity", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_multiplication_config",
      "'admin.set_multiplication_config'"
    );
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("'multiplication_config'");
    expect(body).not.toContain("fed_capacity");
  });

  it("locks function EXECUTE down to authenticated only on the new signature", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_multiplication_config",
      "text, integer, jsonb, jsonb"
    );
  });
});
