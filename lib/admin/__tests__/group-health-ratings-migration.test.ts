import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the group-health ratings migration (#128),
// which adds the admin-entered spiritual-growth + relayed group-question write
// path on top of the #127 assessment table. As with the tracer migration test,
// CI has no Postgres (RLS is verified manually per supabase/dev/README.md), so
// these assertions are the CI-runnable guard for the security-critical
// invariants: write only via a SECURITY DEFINER RPC guarded on auth_is_admin(),
// a paired audit_events row in the same function body, and the leader-reported
// provenance flag forced server-side. Mirrors group-health-migration.test.ts.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260530020000_phase_gh2_group_health_ratings.sql",
    import.meta.url,
  ),
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("group-health ratings migration — audited SECURITY DEFINER write path", () => {
  it("defines the ratings RPC as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.admin_set_group_health_ratings",
    );
    const fn = lower().slice(lower().indexOf("admin_set_group_health_ratings"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const fn = lower().slice(lower().indexOf("admin_set_group_health_ratings"));
    expect(fn).toContain("if not public.auth_is_admin() then");
    expect(fn).toContain("v_actor := public.auth_profile_id();");
  });

  it("rejects out-of-range 1–5 ratings", () => {
    const fn = lower().slice(lower().indexOf("admin_set_group_health_ratings"));
    expect(fn).toContain("p_spiritual_growth_score");
    expect(fn).toContain("p_group_question_score");
    expect(fn).toContain("'invalid_input'");
  });

  it("forces the leader-reported provenance flag from the score's presence", () => {
    // The group question is always leader-reported, admin-entered; the flag is
    // derived server-side (true exactly when a score is present), never trusted
    // from the caller, so it can't be mistaken for the admin's own assessment.
    const fn = lower().slice(lower().indexOf("admin_set_group_health_ratings"));
    expect(fn).toContain(
      "group_question_leader_reported = (p_group_question_score is not null)",
    );
  });

  it("writes a paired audit_events row with a before/after snapshot", () => {
    const fn = lower().slice(lower().indexOf("admin_set_group_health_ratings"));
    expect(fn).toContain("insert into public.audit_events");
    expect(fn).toContain("'admin.set_group_health_ratings'");
    expect(fn).toContain("'group_health_assessments'");
    expect(fn).toContain("'before'");
    expect(fn).toContain("'after'");
  });

  it("includes the overwritten attendance snapshot in the audit trail", () => {
    // The RPC also refreshes attendance from the live recompute, so the audit
    // must carry attendance evidence or the change has no before/after record.
    const audit = lower().slice(lower().indexOf("insert into public.audit_events"));
    expect(audit).toContain("'attendance_pct'");
    expect(audit).toContain("'attendance_weeks_counted'");
  });

  it("redacts the spiritual-growth note body from audit metadata", () => {
    // Note body stays confined to group_health_assessments; audit logs only a
    // presence flag (has_notes convention), never the pastoral text.
    const audit = lower().slice(lower().indexOf("insert into public.audit_events"));
    expect(audit).toContain("'has_spiritual_growth_note'");
    expect(audit).not.toContain("'spiritual_growth_note',");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "revoke all on function public.admin_set_group_health_ratings",
    );
    expect(lower()).toContain(
      "grant execute on function public.admin_set_group_health_ratings",
    );
  });
});
