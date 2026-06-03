import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Group-health triage final-filter
// migration (Admin IM 05 / #265): it adds the needs_follow_up flag + its
// audited write path, and teaches the metric-defaults RPCs the two
// director-confirmed thresholds (Watch grade + attendance decline margin). CI
// has no Postgres (RLS verified manually), so these regex assertions are the
// CI-runnable guard for the security-critical invariants.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260603120000_phase_gh3_group_health_follow_up.sql");
});

const RATINGS_ARGS =
  "uuid, date, smallint, text, smallint, boolean, numeric, integer, numeric, text";

describe("group-health follow-up migration — needs_follow_up flag + write path", () => {
  it("adds the needs_follow_up boolean column NOT NULL DEFAULT false", () => {
    expect(sql.lower).toContain(
      "add column if not exists needs_follow_up boolean not null default false"
    );
  });

  it("drops the prior ratings RPC overload before recreating it", () => {
    expect(sql.lower).toContain(
      "drop function if exists public.admin_set_group_health_ratings("
    );
  });

  it("recreates the ratings RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_group_health_ratings");
  });

  it("guards the write on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("persists needs_follow_up and rides it in the before/after audit", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_group_health_ratings",
      "'admin.set_group_health_ratings'"
    );
    const body = functionBody(sql, "admin_set_group_health_ratings");
    // Written to the row, derived from the (coalesced) input, and audited.
    expect(body).toContain(
      "needs_follow_up                = excluded.needs_follow_up"
    );
    expect(body).toContain("v_follow_up := coalesce(p_needs_follow_up, false)");
    expect(body).toContain("'needs_follow_up'");
  });

  it("still forces the leader-reported provenance flag server-side", () => {
    const body = functionBody(sql, "admin_set_group_health_ratings");
    expect(body).toContain(
      "group_question_leader_reported = (p_group_question_score is not null)"
    );
  });

  it("locks the recreated ratings RPC EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_set_group_health_ratings", RATINGS_ARGS);
  });
});

describe("group-health follow-up migration — director thresholds in metric_defaults", () => {
  it("seeds the two confirmed defaults via repair-merge (only when unset)", () => {
    expect(sql.lower).toContain("'group_health_watch_grade', 'c'");
    expect(sql.lower).toContain(
      "'group_health_attendance_decline_margin_pct', 10"
    );
    expect(sql.lower).toContain(
      "and not (setting_value ? 'group_health_watch_grade')"
    );
  });

  it("teaches admin_update_metric_defaults to whitelist + bound the two keys", () => {
    const body = functionBody(sql, "admin_update_metric_defaults");
    // Watch grade is an A–D string.
    expect(body).toContain("p_settings ? 'group_health_watch_grade'");
    expect(body).toContain("not in ('a','b','c','d')");
    // Decline margin is a 0..100 integer.
    expect(body).toContain(
      "p_settings ? 'group_health_attendance_decline_margin_pct'"
    );
    // Both keys merge into the stored jsonb.
    expect(body).toContain("jsonb_build_object('group_health_watch_grade'");
    expect(body).toContain(
      "jsonb_build_object('group_health_attendance_decline_margin_pct'"
    );
  });

  it("keeps admin_update_metric_defaults audited, definer, and locked down", () => {
    assertSecurityDefiner(sql, "admin_update_metric_defaults");
    assertPairedAuditInsert(
      sql,
      "admin_update_metric_defaults",
      "'admin.update_metric_defaults'"
    );
    assertExecuteLockdown(sql, "admin_update_metric_defaults", "jsonb");
  });

  it("carries the two new keys in the reset baseline", () => {
    const body = functionBody(sql, "admin_reset_metric_defaults");
    expect(body).toContain("'group_health_watch_grade',                   'c'");
    expect(body).toContain("'group_health_attendance_decline_margin_pct', 10");
    assertExecuteLockdown(sql, "admin_reset_metric_defaults");
  });
});

describe("group-health follow-up migration — recompute carries the flag forward", () => {
  it("recreates the recompute RPC inheriting the latest needs_follow_up on insert", () => {
    const body = functionBody(sql, "admin_upsert_group_health_assessment");
    // Reads the group's most recent assessment flag (any month)...
    expect(body).toContain("select needs_follow_up");
    expect(body).toContain("order by period_month desc");
    // ...and inserts it, so a freshly created current-month row doesn't drop a
    // carried-open flag back to the column default.
    expect(body).toContain(
      "v_carry_follow_up := coalesce(v_carry_follow_up, false)"
    );
    expect(body).toContain(
      "needs_follow_up, computed_numeric, computed_letter"
    );
  });

  it("audits the flag's before/after, using the actually-persisted value", () => {
    const body = functionBody(sql, "admin_upsert_group_health_assessment");
    // The final persisted flag (carry on insert, preserved on conflict) is read
    // back via RETURNING and recorded as the after-state, with needs_follow_up
    // in both before and after snapshots.
    expect(body).toContain(
      "returning id, needs_follow_up into v_id, v_final_follow_up"
    );
    expect(body).toContain("'needs_follow_up', v_final_follow_up");
  });

  it("keeps the recompute RPC audited, definer, and locked down", () => {
    assertSecurityDefiner(sql, "admin_upsert_group_health_assessment");
    assertPairedAuditInsert(
      sql,
      "admin_upsert_group_health_assessment",
      "'admin.upsert_group_health_assessment'"
    );
    assertExecuteLockdown(
      sql,
      "admin_upsert_group_health_assessment",
      "uuid, date, numeric, integer, numeric, text"
    );
  });
});
