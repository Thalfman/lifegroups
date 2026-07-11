import { describe, expect, it } from "vitest";

import {
  effectiveSelectPolicies,
  listMigrations,
  loadMigration,
  selectPolicies,
  tablesWithRlsEnabled,
  type ParsedPolicy,
} from "./migration-safety";

const INITPLAN_MIGRATION = loadMigration(
  "20260714010000_rls_initplan_wrap_noarg_helpers.sql"
);
const COLLAPSE_MIGRATION = loadMigration(
  "20260717000000_collapse_staff_viewer_helpers.sql"
);
const ALL_MIGRATIONS = listMigrations().map(loadMigration);

const EXPECTED_POLICIES = [
  "attendance_records.attendance_records_read",
  "attendance_sessions.attendance_sessions_read",
  "follow_ups.follow_ups_read",
  "group_calendar_events.group_calendar_events_read",
  "group_health_updates.group_health_updates_read",
  "group_leaders.group_leaders_read",
  "group_memberships.group_memberships_read",
  "group_status_history.group_status_history_read",
  "groups.groups_read",
  "guests.guests_read",
  "members.members_read",
  "profiles.profiles_read",
] as const;

function policyKey(policy: ParsedPolicy): string {
  return `${policy.table}.${policy.name}`;
}

function policiesInMigrationWith(
  helperName: string,
  migration = INITPLAN_MIGRATION
): ParsedPolicy[] {
  return [...tablesWithRlsEnabled(ALL_MIGRATIONS)].flatMap((table) =>
    selectPolicies(migration, table).filter((policy) =>
      policy.predicate.includes(helperName)
    )
  );
}

describe("collapse retired staff-viewer RLS helpers migration (#866)", () => {
  it("wraps the policy recreation and helper drops in one transaction", () => {
    expect(COLLAPSE_MIGRATION.lower).toMatch(/^\s*--[\s\S]*\nbegin;/);
    expect(COLLAPSE_MIGRATION.lower).toMatch(/commit;\s*$/);
  });

  it("recreates the complete prior helper-policy census and nothing else", () => {
    const priorPolicies = policiesInMigrationWith("auth_is_admin_or_staff()");
    expect(priorPolicies.map(policyKey).sort()).toEqual(
      [...EXPECTED_POLICIES].sort()
    );

    const recreatedPolicies = EXPECTED_POLICIES.map((key) => {
      const [table, name] = key.split(".");
      return selectPolicies(COLLAPSE_MIGRATION, table).find(
        (policy) => policy.name === name
      );
    });
    expect(recreatedPolicies.every(Boolean)).toBe(true);
    expect(
      COLLAPSE_MIGRATION.lower.match(/\bcreate\s+policy\b/g) ?? []
    ).toHaveLength(EXPECTED_POLICIES.length);
  });

  it("changes only the retired helper name in each copied predicate", () => {
    for (const key of EXPECTED_POLICIES) {
      const [table, name] = key.split(".");
      const before = selectPolicies(INITPLAN_MIGRATION, table).find(
        (policy) => policy.name === name
      );
      const after = selectPolicies(COLLAPSE_MIGRATION, table).find(
        (policy) => policy.name === name
      );

      expect(
        before,
        `${key} should exist in the InitPlan migration`
      ).toBeDefined();
      expect(after, `${key} should be recreated by #866`).toBeDefined();
      expect(after?.predicate).toBe(
        before?.predicate.replaceAll(
          "auth_is_admin_or_staff()",
          "auth_is_admin()"
        )
      );
    }
  });

  it("leaves no in-force SELECT policy dependent on either retired helper", () => {
    const retiredHelpers = [
      "auth_is_admin_or_staff()",
      "auth_is_staff_viewer()",
    ] as const;
    const offenders = [...tablesWithRlsEnabled(ALL_MIGRATIONS)].flatMap(
      (table) =>
        effectiveSelectPolicies(ALL_MIGRATIONS, table).flatMap((policy) =>
          retiredHelpers
            .filter((helper) => policy.predicate.includes(helper))
            .map((helper) => `${policyKey(policy)}: ${helper}`)
        )
    );

    expect(offenders.sort()).toEqual([]);
  });

  it("drops both helpers only after their policy dependencies are gone", () => {
    const lastPolicy = COLLAPSE_MIGRATION.lower.lastIndexOf("create policy");
    for (const helper of ["auth_is_admin_or_staff", "auth_is_staff_viewer"]) {
      const drop = `drop function if exists public.${helper}() restrict;`;
      expect(COLLAPSE_MIGRATION.lower).toContain(drop);
      expect(COLLAPSE_MIGRATION.lower.indexOf(drop)).toBeGreaterThan(
        lastPolicy
      );
    }
  });
});
