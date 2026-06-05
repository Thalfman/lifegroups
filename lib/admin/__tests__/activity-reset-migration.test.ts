import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// activity-reset: static boundary assertions over the activity-reset migration.
// CI has no Postgres, so these string assertions guard the security-critical
// invariants of the two RPCs and the table's RLS, and pin the behaviour that
// makes this reset honest: it is a baseline floor that deletes NO domain rows —
// the band is a count of real groups/guests/memberships/follow-ups/care rows,
// and a reset must never touch them.

const RESET_FN = "super_admin_reset_activity";
const CLEAR_FN = "super_admin_clear_activity_reset";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260607120000_activity_reset_baseline.sql");
});

describe("activity-reset migration — table + RLS", () => {
  it("makes activity_reset_baselines admin-readable, with no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.activity_reset_baselines enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_is_admin())"
    );
    expect(sql.lower).toContain(
      "grant  select on public.activity_reset_baselines to authenticated"
    );
  });

  it("defines no INSERT/UPDATE/DELETE policy on the table", () => {
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+insert/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+update/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+delete/);
  });

  it("guards the scope and enforces a single global baseline", () => {
    expect(sql.lower).toContain("scope in ('global')");
    expect(sql.lower).toContain("uq_activity_reset_baselines_global");
  });

  it("never deletes from the domain tables the band counts (non-destructive)", () => {
    // The reset is a baseline floor, not a wipe — these rows are real ministry
    // data. The only DELETE the migration may issue is against its own baseline
    // table.
    for (const table of [
      "groups",
      "guests",
      "group_memberships",
      "follow_ups",
      "shepherd_care_interactions",
    ]) {
      expect(sql.lower).not.toContain(`delete from public.${table}`);
    }
  });
});

describe(`activity-reset migration — ${RESET_FN}`, () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, RESET_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the distinct activity_reset advisory lock", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('activity_reset'))"
    );
  });

  it("uses the church-local date for the baseline, not current_date", () => {
    const body = functionBody(sql, RESET_FN);
    expect(body).toContain("at time zone 'america/chicago'");
    expect(body).not.toContain(":= current_date");
  });

  it("replaces the single global baseline (delete then insert into its own table)", () => {
    const body = functionBody(sql, RESET_FN);
    expect(body).toContain(
      "delete from public.activity_reset_baselines where scope = 'global'"
    );
    expect(body).toContain("insert into public.activity_reset_baselines");
  });

  it("writes one paired audit row", () => {
    assertPairedAuditInsert(sql, RESET_FN, "'super_admin.reset_activity'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, RESET_FN);
  });
});

describe(`activity-reset migration — ${CLEAR_FN}`, () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, CLEAR_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, CLEAR_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the activity_reset advisory lock", () => {
    expect(functionBody(sql, CLEAR_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('activity_reset'))"
    );
  });

  it("removes the global baseline", () => {
    expect(functionBody(sql, CLEAR_FN)).toContain(
      "delete from public.activity_reset_baselines where scope = 'global'"
    );
  });

  it("writes one paired audit row", () => {
    assertPairedAuditInsert(
      sql,
      CLEAR_FN,
      "'super_admin.clear_activity_reset'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, CLEAR_FN);
  });
});
