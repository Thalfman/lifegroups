import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the group-health tracer migration (#127).
// The repo has no DB-backed test runner and CI has no Postgres (RLS is
// verified manually per supabase/dev/README.md), so these assertions are the
// CI-runnable regression guard for the security-critical invariants: admin-only
// RLS, write only via a SECURITY DEFINER RPC, and a paired audit_events row in
// the same function body. The security-critical invariants compose the shared
// migration-safety vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260530010000_phase_gh1_group_health_assessments.sql");
});

describe("group-health migration — table shape", () => {
  it("creates the assessments table", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.group_health_assessments"
    );
  });

  it("enforces one row per group per month", () => {
    expect(sql.lower).toContain("unique (group_id, period_month)");
  });

  it("constrains the computed and override letters to A-D", () => {
    expect(sql.lower).toContain("computed_letter in ('a','b','c','d')");
    expect(sql.lower).toContain("override_letter in ('a','b','c','d')");
  });

  it("reserves the rated-dimension and override columns for #128/#129", () => {
    const block = sql.raw.slice(
      sql.raw.indexOf(
        "create table if not exists public.group_health_assessments"
      ),
      sql.raw.indexOf(
        ");",
        sql.raw.indexOf(
          "create table if not exists public.group_health_assessments"
        )
      )
    );
    expect(block).toMatch(/spiritual_growth_score\s+smallint/i);
    expect(block).toMatch(/group_question_score\s+smallint/i);
    expect(block).toMatch(/group_question_leader_reported\s+boolean/i);
    expect(block).toMatch(
      /override_scope\s+public\.group_health_override_scope/i
    );
  });
});

describe("group-health migration — admin-only RLS, no leader exposure", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.group_health_assessments")
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never grants a leader or over_shepherd write/read policy", () => {
    expect(sql.lower).not.toContain("'leader'");
    expect(sql.lower).not.toContain("'over_shepherd'");
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.group_health_assessments from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.group_health_assessments to authenticated"
    );
  });
});

describe("group-health migration — audited SECURITY DEFINER write path", () => {
  it("defines the upsert RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_upsert_group_health_assessment");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_upsert_group_health_assessment");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("writes a paired audit_events row with a before/after snapshot", () => {
    assertPairedAuditInsert(
      sql,
      "admin_upsert_group_health_assessment",
      "'admin.upsert_group_health_assessment'"
    );
    const body = functionBody(sql, "admin_upsert_group_health_assessment");
    expect(body).toContain("'group_health_assessments'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_upsert_group_health_assessment");
  });
});
