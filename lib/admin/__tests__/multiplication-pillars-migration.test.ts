import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Multiplication Pillars config migration
// (#380). CI has no Postgres (RLS verified manually per supabase/dev/README.md),
// so these substring/regex checks are the runnable regression guard for the
// security-critical invariants: admin-only RLS, write only via a SECURITY
// DEFINER RPC with a paired audit row + a pinned search_path, the per-(type,year)
// upsert key, and the EXECUTE lockdown.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608080000_phase_pivot8_multiplication_pillars.sql");
});

describe("multiplication-pillars migration — table", () => {
  it("creates multiplication_config keyed per type + ministry year", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.multiplication_config"
    );
    expect(sql.lower).toContain("group_type    text not null");
    expect(sql.lower).toContain("ministry_year integer not null");
  });

  it("uniquely keys a config row on (group_type, ministry_year)", () => {
    expect(sql.lower).toContain("unique (group_type, ministry_year)");
  });

  it("constrains group_type to the three audience categories", () => {
    expect(sql.lower).toContain("group_type in ('men','women','mixed')");
  });

  it("constrains the three jsonb payloads to objects", () => {
    expect(sql.lower).toContain("jsonb_typeof(thresholds) = 'object'");
    expect(sql.lower).toContain("jsonb_typeof(trigger_rubric) = 'object'");
    expect(sql.lower).toContain("jsonb_typeof(fed_capacity) = 'object'");
  });

  it("attaches a set_updated_at trigger", () => {
    expect(sql.lower).toContain("multiplication_config_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("multiplication-pillars migration — admin-only RLS", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.multiplication_config")
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never opens a leader/over_shepherd read path on the config table", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    const configPolicies = policyChunks.filter((c) =>
      c.includes("on public.multiplication_config")
    );
    expect(configPolicies.length).toBeGreaterThan(0);
    for (const policy of configPolicies) {
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("auth_role() = 'leader'");
      expect(policy).not.toContain("auth_is_admin_or_staff");
    }
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.multiplication_config from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.multiplication_config to authenticated"
    );
  });
});

describe("multiplication-pillars migration — audited SECURITY DEFINER write path", () => {
  it("defines admin_set_multiplication_config as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_multiplication_config");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("validates the group_type, ministry year, and jsonb shapes", () => {
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("p_group_type not in ('men','women','mixed')");
    expect(body).toContain("p_ministry_year is null");
    expect(body).toContain("jsonb_typeof(p_thresholds) <> 'object'");
    expect(body).toContain("jsonb_typeof(p_trigger) <> 'object'");
    expect(body).toContain("jsonb_typeof(p_fed_capacity) <> 'object'");
  });

  it("upserts on the (group_type, ministry_year) conflict target", () => {
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("on conflict (group_type, ministry_year) do update");
  });

  it("writes a paired audit_events row with action admin.set_multiplication_config", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_multiplication_config",
      "'admin.set_multiplication_config'"
    );
    const body = functionBody(sql, "admin_set_multiplication_config");
    expect(body).toContain("'multiplication_config'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_multiplication_config",
      "text, integer, jsonb, jsonb, jsonb"
    );
  });
});
