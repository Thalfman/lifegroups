import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the per-TYPE readiness-rule migration (#410 /
// ADR 0021) — the MIDDLE tier of the global → per-type → per-cell cascade. CI has
// no Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the runnable regression guard for the new store's
// security-critical invariants: an admin-only-readable table keyed per (ministry
// year, Audience) and an audited SECURITY DEFINER write RPC under the EXECUTE
// lockdown.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260616000000_phase_groups6_per_type_readiness_rule.sql"
  );
});

describe("per-type readiness-rule migration — the per-type store", () => {
  it("references #410 and ADR 0021 in the documentary header", () => {
    expect(sql.raw).toContain("#410");
    expect(sql.lower).toContain("0021-three-tier-multiplication-trigger");
  });

  it("creates the audience_readiness_rule table, one row per (ministry year, Audience)", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.audience_readiness_rule"
    );
    // The upsert conflict target: (ministry_year, audience_category) is unique.
    expect(sql.lower).toContain(
      "constraint audience_readiness_rule_year_type_unique"
    );
    expect(sql.lower).toContain("unique (ministry_year, audience_category)");
    // Audience is constrained to the three top types, and the rule is an object.
    expect(sql.lower).toContain("audience_category in ('men','women','mixed')");
    expect(sql.lower).toContain("jsonb_typeof(rule) = 'object'");
  });

  it("keeps an updated_at trigger like the sibling rule tables", () => {
    expect(sql.lower).toContain(
      "create trigger audience_readiness_rule_set_updated_at"
    );
  });

  it("admin-only RLS read on the per-type rule table", () => {
    expect(sql.lower).toContain(
      "create policy audience_readiness_rule_admin_read"
    );
    expect(sql.lower).toContain("using (public.auth_is_admin())");
    // Only SELECT is granted to authenticated (writes go through the RPC).
    expect(sql.lower).toContain(
      "grant  select on public.audience_readiness_rule to authenticated"
    );
  });
});

describe("per-type readiness-rule migration — the write RPC", () => {
  it("admin_set_audience_readiness_rule is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_audience_readiness_rule");
  });

  it("guards on auth_is_admin(), validates the year + type + object rule, upserts on (year, type)", () => {
    const body = functionBody(sql, "admin_set_audience_readiness_rule");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
    expect(body).toContain(
      "p_audience_category not in ('men','women','mixed')"
    );
    expect(body).toContain("jsonb_typeof(p_rule) <> 'object'");
    expect(body).toContain(
      "on conflict (ministry_year, audience_category) do update"
    );
  });

  it("writes a paired audit_events row for the per-type rule write", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_audience_readiness_rule",
      "'admin.set_audience_readiness_rule'"
    );
    const body = functionBody(sql, "admin_set_audience_readiness_rule");
    expect(body).toContain("'audience_readiness_rule'");
    // The audit captures the before/after rule for the change history.
    expect(body).toContain("'before', v_before");
    expect(body).toContain("'after', p_rule");
  });

  it("locks EXECUTE down to authenticated only on admin_set_audience_readiness_rule", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_audience_readiness_rule",
      "integer, text, jsonb"
    );
  });
});
