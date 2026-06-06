import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Group-Health Grade in Care migration
// (#377 / ADR 0018, Pivot slice 4). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants: one grade per group per
// ministry year, A–F + scope checks, admin-only RLS, a SECURITY DEFINER RPC with
// a paired audit row, and the EXECUTE lockdown.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260608050000_phase_pivot4_group_health_grade_care.sql"
  );
});

describe("group-health-grade migration — table", () => {
  it("creates the group_rubric_grades table", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.group_rubric_grades"
    );
  });

  it("references groups and carries a ministry_year integer", () => {
    expect(sql.lower).toContain("references public.groups(id)");
    expect(sql.lower).toContain("ministry_year        integer not null");
  });

  it("keys one grade per group per ministry year (unique constraint)", () => {
    expect(sql.lower).toContain("unique (group_id, ministry_year)");
  });

  it("stores criterion_scores as a jsonb object", () => {
    expect(sql.lower).toContain("criterion_scores     jsonb not null");
    expect(sql.lower).toContain("jsonb_typeof(criterion_scores) = 'object'");
  });

  it("constrains computed + override letters to A–F", () => {
    expect(sql.lower).toContain("computed_letter in ('a','b','c','d','f')");
    expect(sql.lower).toContain("override_letter in ('a','b','c','d','f')");
  });

  it("constrains the override scope to this_month / until_cleared", () => {
    expect(sql.lower).toContain(
      "override_scope in ('this_month','until_cleared')"
    );
  });

  it("attaches a set_updated_at trigger", () => {
    expect(sql.lower).toContain("group_rubric_grades_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("group-health-grade migration — admin-only RLS", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.group_rubric_grades")
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never opens a leader/over_shepherd read path on the table", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    const policies = policyChunks.filter((c) =>
      c.includes("on public.group_rubric_grades")
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("auth_role() = 'leader'");
    }
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.group_rubric_grades from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.group_rubric_grades to authenticated"
    );
  });
});

describe("group-health-grade migration — audited SECURITY DEFINER write path", () => {
  const ARGS = "uuid, integer, jsonb, text, text, text, date";

  it("defines admin_set_group_rubric_grade as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_group_rubric_grade");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("verifies the group exists before writing", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("from public.groups where id = p_group_id");
    expect(body).toContain("missing_group");
  });

  it("re-validates the scores jsonb object + 0–100 range at the trust boundary", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("jsonb_typeof(p_criterion_scores) <> 'object'");
    expect(body).toContain("jsonb_each(p_criterion_scores)");
    expect(body).toContain("> 100");
  });

  it("re-validates A–F letters and the override scope enum", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("p_computed_letter not in ('a','b','c','d','f')");
    expect(body).toContain("p_override_letter not in ('a','b','c','d','f')");
    expect(body).toContain(
      "p_override_scope not in ('this_month','until_cleared')"
    );
  });

  it("rejects a half-specified override (letter + scope must travel together)", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain(
      "(p_override_letter is null) <> (p_override_scope is null)"
    );
  });

  it("normalizes the override period to the first of its month", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("date_trunc('month', p_override_period_month)");
    // …and persists/audits the normalized value, not the raw parameter.
    expect(body).toContain("p_override_scope, v_period");
    expect(body).toContain("'override_period_month', v_period");
  });

  it("upserts on (group_id, ministry_year)", () => {
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("on conflict (group_id, ministry_year) do update");
  });

  it("writes a paired audit_events row with action admin.set_group_rubric_grade", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_group_rubric_grade",
      "'admin.set_group_rubric_grade'"
    );
    const body = functionBody(sql, "admin_set_group_rubric_grade");
    expect(body).toContain("'group_rubric_grades'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_set_group_rubric_grade", ARGS);
  });
});
