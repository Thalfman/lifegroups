import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Leader-Health Grade migration (#378 / ADR
// 0018, pivot slice 5). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants: admin-only RLS read,
// write only via a SECURITY DEFINER RPC with a paired audit row, and the A–F /
// scope / ministry-year shape of the leader_rubric_grades table + RPC.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608060000_phase_pivot5_leader_health.sql");
});

describe("leader-health migration — table", () => {
  it("creates the leader_rubric_grades table", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.leader_rubric_grades"
    );
  });

  it("keys one grade per leader per ministry year", () => {
    expect(sql.lower).toContain("unique (profile_id, ministry_year)");
    expect(sql.lower).toContain("ministry_year        integer not null");
  });

  it("references profiles(id) with a cascading delete", () => {
    expect(sql.lower).toContain(
      "profile_id           uuid not null references public.profiles(id) on delete cascade"
    );
  });

  it("constrains criterion_scores to a jsonb object", () => {
    expect(sql.lower).toContain("jsonb_typeof(criterion_scores) = 'object'");
  });

  it("constrains the computed + override letters to A–F", () => {
    expect(sql.lower).toContain("computed_letter in ('a','b','c','d','f')");
    expect(sql.lower).toContain("override_letter in ('a','b','c','d','f')");
  });

  it("reuses the shared group_health_override_scope enum (no second enum)", () => {
    expect(sql.lower).toContain(
      "override_scope       public.group_health_override_scope"
    );
    // It must NOT create a brand-new override-scope enum for the leader grade.
    expect(sql.lower).not.toContain("create type public.leader");
  });

  it("pairs the override letter + scope so they travel together", () => {
    expect(sql.lower).toContain(
      "(override_letter is null) = (override_scope is null)"
    );
  });

  it("attaches a set_updated_at trigger", () => {
    expect(sql.lower).toContain("leader_rubric_grades_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("leader-health migration — admin-only RLS", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.leader_rubric_grades")
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never opens a leader/over_shepherd read path on the grade table", () => {
    // The grade is an oversight signal, admin-only — never leader-facing, even
    // though it grades a leader. Assert every policy on the table gates strictly
    // on auth_is_admin() and never names a leader/over_shepherd role.
    const policyChunks = sql.lower.split("create policy").slice(1);
    const gradePolicies = policyChunks.filter((c) =>
      c.includes("on public.leader_rubric_grades")
    );
    expect(gradePolicies.length).toBeGreaterThan(0);
    for (const policy of gradePolicies) {
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("auth_role() = 'leader'");
      expect(policy).not.toContain("auth_is_admin_or_staff");
    }
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.leader_rubric_grades from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.leader_rubric_grades to authenticated"
    );
  });
});

describe("leader-health migration — audited SECURITY DEFINER write path", () => {
  it("defines admin_set_leader_rubric_grade as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_leader_rubric_grade");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("validates the scores object, letters, and override scope (trust boundary)", () => {
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("jsonb_typeof(p_criterion_scores) <> 'object'");
    expect(body).toContain("jsonb_each(p_criterion_scores)");
    expect(body).toContain("p_computed_letter not in ('a','b','c','d','f')");
    expect(body).toContain(
      "p_override_scope not in ('this_month','until_cleared')"
    );
  });

  it("verifies the graded profile exists before writing", () => {
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("from public.profiles where id = p_profile_id");
    expect(body).toContain("raise exception 'missing_profile'");
  });

  it("rejects a target that is not an active leader/co-leader", () => {
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("from public.group_leaders");
    expect(body).toContain("role in ('leader','co_leader')");
    expect(body).toContain("raise exception 'not_a_leader'");
  });

  it("upserts on the (profile, ministry year) conflict target", () => {
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("on conflict (profile_id, ministry_year) do update");
  });

  it("writes a paired audit_events row with action admin.set_leader_rubric_grade", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_leader_rubric_grade",
      "'admin.set_leader_rubric_grade'"
    );
    const body = functionBody(sql, "admin_set_leader_rubric_grade");
    expect(body).toContain("'leader_rubric_grades'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_leader_rubric_grade",
      "uuid, integer, jsonb, text, text, text, date"
    );
  });

  it("does NOT redefine admin_set_health_rubric (it already handles the leader kind)", () => {
    expect(sql.lower).not.toContain("function public.admin_set_health_rubric");
  });
});
