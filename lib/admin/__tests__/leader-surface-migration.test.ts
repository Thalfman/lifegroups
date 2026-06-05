import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the PIVOT.10 leader-surface migration (#376).
// CI has no Postgres (RLS is verified manually per supabase/dev/README.md), so
// these string assertions are the CI-runnable regression guard for the
// security-critical invariants this slice lands:
//
//   1. read_frozen_surface_flag — a leader-SAFE frozen-surface flag read:
//      SECURITY DEFINER with a pinned search_path, returns the RESOLVED boolean
//      (enabled AND verified, ADR 0009), accepts ONLY frozen-surface keys
//      (rejects everything else to false), and grants EXECUTE to authenticated.
//   2. The verify-before-flip flip: leader_surface.verified = true is deep-merged
//      into platform_config.feature_flags (preserving other flags / enabled).
//   3. Leader-read RLS is group-scoped via auth_is_leader_of() — asserted as a
//      cross-group rejection against the consolidated SELECT-policy migration.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608040000_phase_pivot10_leader_surface.sql");
});

describe("read_frozen_surface_flag — leader-safe frozen-flag read", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "read_frozen_surface_flag");
  });

  it("resolves enabled AND verified (ADR 0009 verify-before-flip rule)", () => {
    const body = functionBody(sql, "read_frozen_surface_flag");
    expect(body).toContain("'enabled') = 'true'::jsonb");
    expect(body).toContain("'verified') = 'true'::jsonb");
    // The two must be AND'd — verified alone or enabled alone must not pass.
    expect(body).toContain("and");
  });

  it("whitelists ONLY the three frozen-surface keys", () => {
    const body = functionBody(sql, "read_frozen_surface_flag");
    expect(body).toContain("'leader_surface'");
    expect(body).toContain("'check_ins'");
    expect(body).toContain("'guests'");
    // Any non-whitelisted key fails closed to false, so a new-surface /
    // nav-visibility flag can never leak through this leader-readable RPC.
    expect(body).toContain("not in (");
    expect(body).toContain("then false");
  });

  it("fails closed when there is no config / flag", () => {
    expect(functionBody(sql, "read_frozen_surface_flag")).toContain(
      "coalesce("
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    // Leader-readable by design: revoked from public/anon/authenticated, then
    // granted only to authenticated. The body's key whitelist + resolved-boolean
    // shape is what scopes the exposure.
    assertExecuteLockdown(sql, "read_frozen_surface_flag", "text");
  });
});

describe("verify-before-flip flip — leader_surface.verified = true", () => {
  it("deep-merges leader_surface.verified into platform_config.feature_flags", () => {
    expect(sql.lower).toContain("update public.platform_config");
    expect(sql.lower).toContain("'feature_flags'");
    expect(sql.lower).toContain("'leader_surface'");
    expect(sql.lower).toContain("'verified', true");
    // Deep-merge (preserve other flags + the existing leader_surface.enabled),
    // never clobber: the existing feature_flags / leader_surface sub-objects are
    // coalesced and OR-merged with the new verified marker.
    expect(sql.lower).toContain("coalesce(setting_value -> 'feature_flags'");
  });

  it("does NOT force enabled on (Tom holds the on/off switch)", () => {
    // The flip records re-verification only; it must not flip `enabled` true,
    // or it would re-open the surface without the Super Admin's deliberate act.
    expect(sql.lower).not.toContain("'enabled', true");
  });

  it("scopes the write to the platform_config keyed row", () => {
    expect(sql.lower).toContain("where setting_key = 'platform_config'");
  });
});

describe("leader-read RLS is group-scoped (cross-group rejection)", () => {
  // The consolidated SELECT policies (20260602020000) gate leader reads through
  // auth_is_leader_of(<group_id>), which requires an active group_leaders row for
  // the caller AND the caller's current profile role being leader/co_leader
  // (20260529006000). A leader therefore reads ONLY their assigned groups' rows;
  // a cross-group read returns nothing. We assert that posture here so the
  // verify-before-flip checkpoint has a CI-runnable cross-group-rejection guard.
  let consolidated: MigrationSql;
  let predicate: MigrationSql;

  beforeAll(() => {
    consolidated = loadMigration(
      "20260602020000_perf_consolidate_select_rls_policies.sql"
    );
    predicate = loadMigration(
      "20260529006000_phase_os7_leader_predicate_role_guard.sql"
    );
  });

  const LEADER_READ_TABLES: Array<{ table: string; scopeArg: string }> = [
    { table: "groups", scopeArg: "auth_is_leader_of(id)" },
    { table: "group_memberships", scopeArg: "auth_is_leader_of(group_id)" },
    { table: "attendance_sessions", scopeArg: "auth_is_leader_of(group_id)" },
    {
      table: "group_health_updates",
      scopeArg: "auth_is_leader_of(group_id)",
    },
    {
      table: "group_calendar_events",
      scopeArg: "auth_is_leader_of(group_id)",
    },
  ];

  it("gates every leader-read table through auth_is_leader_of(group)", () => {
    const norm = consolidated.lower.replace(/\s+/g, " ");
    for (const { table, scopeArg } of LEADER_READ_TABLES) {
      expect(
        norm,
        `${table} leader read should be scoped by public.${scopeArg}`
      ).toContain(`public.${scopeArg}`);
    }
  });

  it("auth_is_leader_of requires BOTH an active group_leaders row AND a leader role", () => {
    const body = functionBody(predicate, "auth_is_leader_of");
    // Group scoping: the active group_leaders row must match the requested group
    // AND belong to the caller — so a leader of group A cannot read group B.
    expect(body).toContain("gl.group_id = p_group_id");
    expect(body).toContain("gl.profile_id = public.auth_profile_id()");
    expect(body).toContain("gl.active");
    // Role guard: a profile converted off leader/co_leader loses access even with
    // stale group_leaders rows.
    expect(body).toContain("auth_role() in ('leader'");
  });
});
