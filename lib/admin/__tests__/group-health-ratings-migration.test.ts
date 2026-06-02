import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the group-health ratings migration (#128),
// which adds the admin-entered spiritual-growth + relayed group-question write
// path on top of the #127 assessment table. As with the tracer migration test,
// CI has no Postgres (RLS is verified manually per supabase/dev/README.md), so
// these assertions are the CI-runnable guard for the security-critical
// invariants: write only via a SECURITY DEFINER RPC guarded on auth_is_admin(),
// a paired audit_events row in the same function body, and the leader-reported
// provenance flag forced server-side. The security-critical invariants compose
// the shared migration-safety vocabulary (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260530020000_phase_gh2_group_health_ratings.sql");
});

describe("group-health ratings migration — audited SECURITY DEFINER write path", () => {
  it("defines the ratings RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_group_health_ratings");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("rejects out-of-range 1–5 ratings", () => {
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain("p_spiritual_growth_score");
    expect(body).toContain("p_group_question_score");
    expect(body).toContain("'invalid_input'");
  });

  it("forces the leader-reported provenance flag from the score's presence", () => {
    // The group question is always leader-reported, admin-entered; the flag is
    // derived server-side (true exactly when a score is present), never trusted
    // from the caller, so it can't be mistaken for the admin's own assessment.
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain(
      "group_question_leader_reported = (p_group_question_score is not null)"
    );
  });

  it("writes a paired audit_events row with a before/after snapshot", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_group_health_ratings",
      "'admin.set_group_health_ratings'"
    );
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain("'group_health_assessments'");
    expect(body).toContain("'before'");
    expect(body).toContain("'after'");
  });

  it("includes the overwritten attendance snapshot in the audit trail", () => {
    // The RPC also refreshes attendance from the live recompute, so the audit
    // must carry attendance evidence or the change has no before/after record.
    assertAuditContentFree(sql, {
      forbidden: [],
      required: ["'attendance_pct'", "'attendance_weeks_counted'"],
    });
  });

  it("redacts the spiritual-growth note body from audit metadata", () => {
    // Note body stays confined to group_health_assessments; audit logs only a
    // presence flag (has_notes convention), never the pastoral text.
    assertAuditContentFree(sql, {
      forbidden: ["'spiritual_growth_note',"],
      required: ["'has_spiritual_growth_note'"],
    });
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_set_group_health_ratings");
  });
});
