import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  selectPolicies,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the first-run-orientation migration (#560).
// The per-user "seen" state lives in an RPC-only table; this guards that
// posture and the self-service RPCs' security invariants.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260705000000_first_run_orientation.sql");
});

describe("#560 migration — first_run_orientations table", () => {
  it("creates the table with RLS enabled", () => {
    expect(sql.lower).toContain("create table public.first_run_orientations");
    expect(sql.lower).toContain(
      "alter table public.first_run_orientations enable row level security"
    );
  });

  it("is RPC-only — no SELECT policy anywhere in the migration", () => {
    expect(selectPolicies(sql, "first_run_orientations")).toEqual([]);
  });

  it("has no INSERT/UPDATE/DELETE policies either", () => {
    expect(sql.lower).not.toMatch(
      /create policy[^;]*on public\.first_run_orientations/
    );
  });

  it("references profiles ON DELETE SET NULL so a later purge isn't blocked", () => {
    expect(sql.lower).toContain(
      "profile_id uuid unique references public.profiles(id) on delete set null"
    );
  });
});

describe("#560 migration — mark_first_run_orientation_seen", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "mark_first_run_orientation_seen");
  });

  it("gates on the caller's own active profile", () => {
    const body = functionBody(sql, "mark_first_run_orientation_seen");
    expect(body).toContain("auth_user_id = auth.uid()");
    expect(body).toContain("status = 'active'");
    expect(body).toContain("insufficient_privilege");
  });

  it("is idempotent (on conflict do nothing)", () => {
    const body = functionBody(sql, "mark_first_run_orientation_seen");
    expect(body).toContain("on conflict (profile_id) do nothing");
  });

  it("writes a paired, content-free audit row only on a real dismissal", () => {
    assertPairedAuditInsert(
      sql,
      "mark_first_run_orientation_seen",
      "'account.mark_orientation_seen'"
    );
    const body = functionBody(sql, "mark_first_run_orientation_seen");
    // The audit is guarded by `found` so a re-submit doesn't stack rows.
    expect(body).toContain("if found then");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "mark_first_run_orientation_seen");
  });
});

describe("#560 migration — first_run_orientation_seen (read)", () => {
  it("is a SECURITY DEFINER read helper", () => {
    assertSecurityDefiner(sql, "first_run_orientation_seen");
    const body = functionBody(sql, "first_run_orientation_seen");
    expect(body).toContain("stable");
    expect(body).toContain("auth_user_id = auth.uid()");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "first_run_orientation_seen");
  });
});
