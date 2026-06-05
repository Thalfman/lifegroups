import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// health-checks-reset: static boundary assertions over the attention-reset
// migration. CI has no Postgres, so these string assertions guard the
// security-critical invariants of the three RPCs and the two tables' RLS, and
// pin the two behaviours that make the reset honest: the care reset NEVER nulls
// last_contact_at, and the health reset performs NO row mutation.

const CARE_FN = "super_admin_reset_care_attention";
const HEALTH_FN = "super_admin_reset_health_attention";
const REVERT_FN = "super_admin_reset_attention_revert";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260605120000_phase_sac6_attention_reset_baseline.sql");
});

describe("attention-reset migration — tables + RLS", () => {
  it("makes attention_reset_baselines admin-readable, with no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.attention_reset_baselines enable row level security"
    );
    // Admin-readable (auth_is_admin admits both admin roles) so the dashboard
    // honours the baseline for the whole admin team.
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_is_admin())"
    );
    expect(sql.lower).toContain(
      "grant  select on public.attention_reset_baselines to authenticated"
    );
  });

  it("makes attention_reset_snapshots super-admin-only, with no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.attention_reset_snapshots enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_role() = 'super_admin')"
    );
    expect(sql.lower).toContain(
      "grant  select on public.attention_reset_snapshots to authenticated"
    );
  });

  it("defines no INSERT/UPDATE/DELETE policy on either table", () => {
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+insert/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+update/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+delete/);
  });

  it("guards the scope/entity pairing and the one-per-surface uniqueness", () => {
    expect(sql.lower).toContain("scope in ('global', 'entity')");
    expect(sql.lower).toContain("surface in ('care', 'health')");
    expect(sql.lower).toContain("uq_attention_reset_baselines_global");
    expect(sql.lower).toContain("uq_attention_reset_baselines_entity");
  });
});

describe(`attention-reset migration — ${CARE_FN}`, () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, CARE_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, CARE_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("validates the scope/entity input", () => {
    expect(functionBody(sql, CARE_FN)).toContain(
      "raise exception 'invalid_input'"
    );
  });

  it("serializes on the distinct attention_reset advisory lock", () => {
    expect(functionBody(sql, CARE_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('attention_reset'))"
    );
  });

  it("captures the snapshot BEFORE the field-wipe update", () => {
    const body = functionBody(sql, CARE_FN);
    const snapshotInsert = body.indexOf(
      "insert into public.attention_reset_snapshots"
    );
    const fieldWipe = body.indexOf("update public.shepherd_care_profiles");
    expect(snapshotInsert).toBeGreaterThan(-1);
    expect(fieldWipe).toBeGreaterThan(-1);
    expect(snapshotInsert).toBeLessThan(fieldWipe);
  });

  it("field-wipes status -> doing_well and clears the touchpoint", () => {
    const body = functionBody(sql, CARE_FN);
    expect(body).toContain("current_status = 'doing_well'");
    expect(body).toContain("next_touchpoint_due = null");
  });

  it("NEVER assigns last_contact_at (the baseline is the contact floor)", () => {
    // Mentioning it in a comment is fine; the invariant is that the field-wipe
    // never writes to it (which would re-arm no_contact_yet / lose history).
    const body = functionBody(sql, CARE_FN);
    expect(body).not.toContain("last_contact_at =");
    expect(body).not.toContain("set last_contact_at");
    expect(body).not.toContain("last_contact_at = null");
  });

  it("writes one paired audit row", () => {
    assertPairedAuditInsert(sql, CARE_FN, "'super_admin.reset_care_attention'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, CARE_FN, "text, uuid");
  });
});

describe(`attention-reset migration — ${HEALTH_FN}`, () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, HEALTH_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, HEALTH_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the attention_reset advisory lock", () => {
    expect(functionBody(sql, HEALTH_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('attention_reset'))"
    );
  });

  it("captures the snapshot BEFORE the needs_follow_up field-wipe", () => {
    const body = functionBody(sql, HEALTH_FN);
    const snapshotInsert = body.indexOf(
      "insert into public.attention_reset_snapshots"
    );
    const firstWipe = body.indexOf("update public.groups");
    expect(snapshotInsert).toBeGreaterThan(-1);
    expect(firstWipe).toBeGreaterThan(-1);
    expect(snapshotInsert).toBeLessThan(firstWipe);
  });

  it("clears all three needs_follow_up sources (status, override, pulse flag)", () => {
    const body = functionBody(sql, HEALTH_FN);
    expect(body).toContain("update public.groups");
    expect(body).toContain("health_status = 'healthy'");
    expect(body).toContain("update public.group_metric_settings");
    expect(body).toContain("manual_health_status_override = null");
    expect(body).toContain("update public.group_health_updates");
    expect(body).toContain("follow_up_needed = false");
  });

  it("clears the follow-up flags by UPDATE, never DELETE (history is preserved)", () => {
    const body = functionBody(sql, HEALTH_FN);
    expect(body).not.toContain("delete from public.group_health_updates");
    expect(body).not.toContain("delete from public.groups");
    expect(body).not.toContain("delete from public.attendance");
  });

  it("writes one paired audit row", () => {
    assertPairedAuditInsert(
      sql,
      HEALTH_FN,
      "'super_admin.reset_health_attention'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, HEALTH_FN, "text, uuid");
  });
});

describe(`attention-reset migration — ${REVERT_FN}`, () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, REVERT_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the attention_reset advisory lock", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('attention_reset'))"
    );
  });

  it("raises missing_snapshot and is idempotent on an already-restored snapshot", () => {
    const body = functionBody(sql, REVERT_FN);
    expect(body).toContain("raise exception 'missing_snapshot'");
    expect(body).toContain("restored_at is not null");
  });

  it("restores the prior baselines and the prior care + health fields", () => {
    const body = functionBody(sql, REVERT_FN);
    expect(body).toContain("prior_baselines");
    expect(body).toContain("jsonb_populate_recordset");
    // Care field restore.
    expect(body).toContain("prior_care_profiles");
    // Health field restore (all three needs_follow_up sources).
    expect(body).toContain("prior_group_health_status");
    expect(body).toContain("prior_metric_overrides");
    expect(body).toContain("prior_pulse_flags");
  });

  it("writes one paired audit row", () => {
    assertPairedAuditInsert(
      sql,
      REVERT_FN,
      "'super_admin.reset_attention_revert'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, REVERT_FN, "uuid");
  });
});
