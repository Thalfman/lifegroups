import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Health Rubric migration (#374 / ADR 0018).
// CI has no Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the runnable regression guard for the security-
// critical invariants: admin-only RLS, write only via a SECURITY DEFINER RPC with
// a paired audit row, and the A–F relaxation of the group-health letter checks.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608010000_phase_pivot3_health_rubric.sql");
});

describe("health-rubric migration — table + enum", () => {
  it("creates the rubric-kind enum guarded by a not-exists check", () => {
    expect(sql.lower).toContain(
      "create type public.health_rubric_kind as enum ('group','leader')"
    );
    expect(sql.lower).toContain("if not exists (select 1 from pg_type");
  });

  it("creates the health_rubrics table with one rubric per kind", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.health_rubrics"
    );
    expect(sql.lower).toContain(
      "kind        public.health_rubric_kind not null unique"
    );
  });

  it("constrains criteria to a jsonb array", () => {
    expect(sql.lower).toContain("jsonb_typeof(criteria) = 'array'");
  });

  it("attaches a set_updated_at trigger", () => {
    expect(sql.lower).toContain("health_rubrics_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("health-rubric migration — admin-only RLS", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.health_rubrics")
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never opens a leader/over_shepherd read path on the rubric table", () => {
    // Note: the migration legitimately mentions the 'leader' rubric *kind*
    // (the enum + the kind guard), so we can't blanket-ban the substring. What
    // matters is that no RLS policy on health_rubrics names a leader-ish role —
    // the rubric is Julian's, admin-only. Assert every policy on the table gates
    // strictly on auth_is_admin() and never references a leader/over_shepherd role.
    const policyChunks = sql.lower.split("create policy").slice(1);
    const rubricPolicies = policyChunks.filter((c) =>
      c.includes("on public.health_rubrics")
    );
    expect(rubricPolicies.length).toBeGreaterThan(0);
    for (const policy of rubricPolicies) {
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("auth_role() = 'leader'");
      expect(policy).not.toContain("auth_is_admin_or_staff");
    }
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.health_rubrics from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.health_rubrics to authenticated"
    );
  });
});

describe("health-rubric migration — audited SECURITY DEFINER write path", () => {
  it("defines admin_set_health_rubric as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_health_rubric");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_health_rubric");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("validates the kind and the jsonb-array criteria", () => {
    const body = functionBody(sql, "admin_set_health_rubric");
    expect(body).toContain("p_kind not in ('group','leader')");
    expect(body).toContain("jsonb_typeof(p_criteria) <> 'array'");
  });

  it("writes a paired audit_events row with action admin.set_health_rubric", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_health_rubric",
      "'admin.set_health_rubric'"
    );
    const body = functionBody(sql, "admin_set_health_rubric");
    expect(body).toContain("'health_rubrics'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_set_health_rubric", "text, jsonb");
  });
});

describe("health-rubric migration — A–F relaxation (ADR 0018 criterion 2)", () => {
  it("drops and re-adds the computed/override letter checks allowing F", () => {
    expect(sql.lower).toContain(
      "drop constraint if exists group_health_assessments_computed_letter_valid"
    );
    expect(sql.lower).toContain(
      "drop constraint if exists group_health_assessments_override_letter_valid"
    );
    expect(sql.lower).toContain("computed_letter in ('a','b','c','d','f')");
    expect(sql.lower).toContain("override_letter in ('a','b','c','d','f')");
  });

  it("re-creates the upsert RPC with an A–F letter guard", () => {
    const body = functionBody(sql, "admin_upsert_group_health_assessment");
    expect(body).toContain("p_computed_letter not in ('a','b','c','d','f')");
  });
});
