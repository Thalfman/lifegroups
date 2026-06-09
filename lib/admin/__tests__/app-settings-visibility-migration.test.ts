import { beforeAll, describe, expect, it } from "vitest";

import {
  effectiveSelectPolicies,
  listMigrations,
  loadMigration,
  selectPolicies,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the app_settings RLS seal (admin RLS
// visibility audit). app_settings was world-readable to any authenticated user
// (app_settings_auth_read → `auth.uid() is not null`) while holding the
// admin-only launch_planning_assumptions.notes. This migration narrows SELECT to
// admins. CI has no Postgres (RLS is verified manually per supabase/dev/README),
// so these substring checks are the runnable regression guard.

const MIGRATION = "20260629000000_seal_app_settings_to_admin.sql";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(MIGRATION);
});

describe("app_settings visibility seal — this migration", () => {
  it("drops the world-readable app_settings_auth_read policy", () => {
    expect(sql.lower).toContain(
      "drop policy if exists app_settings_auth_read on public.app_settings"
    );
  });

  it("creates an admin-only SELECT policy gating on auth_is_admin()", () => {
    const policy = selectPolicies(sql, "app_settings").find(
      (p) => p.name === "app_settings_admin_read"
    );
    expect(policy, "app_settings_admin_read should exist").toBeDefined();
    expect(policy!.predicate).toContain("public.auth_is_admin()");
    // Not the old broad form, and not opened to any lower tier.
    expect(policy!.predicate).not.toContain("auth.uid()");
    expect(policy!.predicate).not.toContain("auth_is_leader_of");
    expect(policy!.predicate).not.toContain("over_shepherd");
  });

  it("adds no INSERT/UPDATE/DELETE policy (writes stay RPC-only)", () => {
    expect(sql.lower).not.toContain("for insert");
    expect(sql.lower).not.toContain("for update");
    expect(sql.lower).not.toContain("for delete");
  });
});

describe("app_settings visibility seal — effective state across migrations", () => {
  it("leaves exactly one surviving SELECT policy, admin-gated", () => {
    const all = listMigrations().map(loadMigration);
    const live = effectiveSelectPolicies(all, "app_settings");
    expect(live.map((p) => p.name)).toEqual(["app_settings_admin_read"]);
    expect(live[0].predicate).toContain("public.auth_is_admin()");
  });

  it("no longer exposes the world-readable predicate to non-admins", () => {
    const all = listMigrations().map(loadMigration);
    for (const policy of effectiveSelectPolicies(all, "app_settings")) {
      // The defining trait of the old bug: a bare `auth.uid() is not null` gate.
      expect(policy.predicate).not.toMatch(/auth\.uid\(\)\s*\)?\s*is not null/);
    }
  });
});
