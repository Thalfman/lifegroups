import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the group-health tracer migration (#127).
// The repo has no DB-backed test runner and CI has no Postgres (RLS is
// verified manually per supabase/dev/README.md), so these assertions are the
// CI-runnable regression guard for the security-critical invariants: admin-only
// RLS, write only via a SECURITY DEFINER RPC, and a paired audit_events row in
// the same function body. Mirrors lib/admin/__tests__/sc4-private-notes-migration.test.ts.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260530010000_phase_gh1_group_health_assessments.sql",
    import.meta.url,
  ),
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("group-health migration — table shape", () => {
  it("creates the assessments table", () => {
    expect(lower()).toContain("create table if not exists public.group_health_assessments");
  });

  it("enforces one row per group per month", () => {
    expect(lower()).toContain("unique (group_id, period_month)");
  });

  it("constrains the computed and override letters to A-D", () => {
    expect(lower()).toContain("computed_letter in ('a','b','c','d')");
    expect(lower()).toContain("override_letter in ('a','b','c','d')");
  });

  it("reserves the rated-dimension and override columns for #128/#129", () => {
    const block = sql.slice(
      sql.indexOf("create table if not exists public.group_health_assessments"),
      sql.indexOf(");", sql.indexOf("create table if not exists public.group_health_assessments")),
    );
    expect(block).toMatch(/spiritual_growth_score\s+smallint/i);
    expect(block).toMatch(/group_question_score\s+smallint/i);
    expect(block).toMatch(/group_question_leader_reported\s+boolean/i);
    expect(block).toMatch(/override_scope\s+public\.group_health_override_scope/i);
  });
});

describe("group-health migration — admin-only RLS, no leader exposure", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(lower()).toContain("enable row level security");
    const policyChunks = lower().split("create policy").slice(1);
    const chunk = policyChunks.find((c) =>
      c.includes("on public.group_health_assessments"),
    );
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never grants a leader or over_shepherd write/read policy", () => {
    expect(lower()).not.toContain("'leader'");
    expect(lower()).not.toContain("'over_shepherd'");
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(lower()).toContain("revoke all    on public.group_health_assessments from authenticated");
    expect(lower()).toContain("grant  select on public.group_health_assessments to authenticated");
  });
});

describe("group-health migration — audited SECURITY DEFINER write path", () => {
  it("defines the upsert RPC as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.admin_upsert_group_health_assessment",
    );
    const fn = lower().slice(lower().indexOf("admin_upsert_group_health_assessment"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const fn = lower().slice(lower().indexOf("admin_upsert_group_health_assessment"));
    expect(fn).toContain("if not public.auth_is_admin() then");
    expect(fn).toContain("v_actor := public.auth_profile_id();");
  });

  it("writes a paired audit_events row with a before/after snapshot", () => {
    const fn = lower().slice(lower().indexOf("admin_upsert_group_health_assessment"));
    expect(fn).toContain("insert into public.audit_events");
    expect(fn).toContain("'admin.upsert_group_health_assessment'");
    expect(fn).toContain("'group_health_assessments'");
    expect(fn).toContain("'before'");
    expect(fn).toContain("'after'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "revoke all on function public.admin_upsert_group_health_assessment",
    );
    expect(lower()).toContain(
      "grant execute on function public.admin_upsert_group_health_assessment",
    );
  });
});
