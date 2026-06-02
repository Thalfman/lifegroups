import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the migration that consolidates the duplicate
// permissive SELECT policies the advisor flagged (multiple_permissive_policies).
// The repo has no DB-backed test runner and CI has no Postgres (RLS verified
// manually per supabase/dev/README.md), so these assertions are the CI-runnable
// regression guard that, per table, the per-tier SELECT policies are dropped and
// replaced by ONE consolidated policy whose USING OR's the same tiers -- with the
// prior InitPlan optimizations preserved verbatim. Mirrors the other
// *-migration.test.ts guards.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260602020000_perf_consolidate_select_rls_policies.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();
// Whitespace-insensitive view so multi-line policy bodies can be matched as one
// normalized string.
const norm = () => lower().replace(/\s+/g, " ");

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

// table -> { drops: old policy names removed, create: consolidated name,
// tiers: substrings that must appear in the OR'd predicate }.
const TABLES: Array<{
  table: string;
  drops: string[];
  create: string;
  tiers: string[];
}> = [
  {
    table: "groups",
    drops: ["groups_admin_staff_read", "groups_leader_read"],
    create: "groups_read",
    tiers: ["public.auth_is_admin_or_staff()", "public.auth_is_leader_of(id)"],
  },
  {
    table: "group_memberships",
    drops: [
      "group_memberships_admin_staff_read",
      "group_memberships_leader_read",
    ],
    create: "group_memberships_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
    ],
  },
  {
    table: "attendance_sessions",
    drops: [
      "attendance_sessions_admin_staff_read",
      "attendance_sessions_leader_read",
    ],
    create: "attendance_sessions_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
    ],
  },
  {
    table: "attendance_records",
    drops: [
      "attendance_records_admin_staff_read",
      "attendance_records_leader_read",
    ],
    create: "attendance_records_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "where s.id = attendance_records.session_id",
      "public.auth_is_leader_of(s.group_id)",
    ],
  },
  {
    table: "group_health_updates",
    drops: [
      "group_health_updates_admin_staff_read",
      "group_health_updates_leader_read",
    ],
    create: "group_health_updates_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
    ],
  },
  {
    table: "group_calendar_events",
    drops: [
      "group_calendar_events_admin_staff_read",
      "group_calendar_events_leader_read",
    ],
    create: "group_calendar_events_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
    ],
  },
  {
    table: "group_status_history",
    drops: [
      "group_status_history_admin_staff_read",
      "group_status_history_leader_read",
    ],
    create: "group_status_history_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
    ],
  },
  {
    table: "group_leaders",
    drops: [
      "group_leaders_admin_staff_read",
      "group_leaders_peer_read",
      "group_leaders_self_read",
    ],
    create: "group_leaders_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(group_id)",
      "profile_id = public.auth_profile_id()",
    ],
  },
  {
    table: "guests",
    drops: ["guests_admin_staff_read", "guests_leader_read"],
    create: "guests_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(first_attended_group_id)",
      "public.auth_is_leader_of(assigned_group_id)",
    ],
  },
  {
    table: "members",
    drops: ["members_admin_staff_read", "members_leader_read"],
    create: "members_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "gm.member_id = members.id",
      "'active'::public.membership_status",
      "public.auth_is_leader_of(gm.group_id)",
    ],
  },
  {
    table: "follow_ups",
    drops: ["follow_ups_admin_staff_read", "follow_ups_leader_read"],
    create: "follow_ups_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      "public.auth_is_leader_of(related_group_id)",
      "assigned_to = public.auth_profile_id()",
    ],
  },
  {
    table: "profiles",
    drops: [
      "profiles_admin_staff_read",
      "profiles_self_read",
      "profiles_over_shepherd_read",
    ],
    create: "profiles_read",
    tiers: [
      "public.auth_is_admin_or_staff()",
      // InitPlan form preserved verbatim (20260601010000).
      "auth_user_id = (select auth.uid())",
      // Set-membership InitPlan form preserved verbatim (20260602010000).
      "id in (select public.over_shepherd_covered_profile_ids())",
    ],
  },
  {
    table: "shepherd_care_profiles",
    drops: [
      "shepherd_care_profiles_admin_select",
      "shepherd_care_profiles_over_shepherd_select",
    ],
    create: "shepherd_care_profiles_select",
    tiers: [
      "public.auth_is_admin()",
      "shepherd_profile_id in (select public.over_shepherd_covered_profile_ids())",
    ],
  },
  {
    table: "shepherd_care_interactions",
    drops: [
      "shepherd_care_interactions_admin_select",
      "shepherd_care_interactions_over_shepherd_select",
    ],
    create: "shepherd_care_interactions_select",
    tiers: [
      "public.auth_is_admin()",
      "scp.id = shepherd_care_interactions.care_profile_id",
      "select public.over_shepherd_covered_profile_ids()",
    ],
  },
  {
    table: "shepherd_coverage_assignments",
    drops: [
      "shepherd_coverage_assignments_admin_select",
      "shepherd_coverage_assignments_over_shepherd_select",
    ],
    create: "shepherd_coverage_assignments_select",
    tiers: [
      "public.auth_is_admin()",
      // InitPlan form preserved verbatim (20260602010000).
      "over_shepherd_id = (select public.auth_over_shepherd_id())",
    ],
  },
];

describe("consolidate-select-rls migration — per table", () => {
  for (const { table, drops, create, tiers } of TABLES) {
    describe(table, () => {
      it("drops each old per-tier SELECT policy", () => {
        for (const name of drops) {
          expect(norm()).toContain(
            `drop policy if exists ${name} on public.${table}`
          );
        }
      });

      it("creates exactly one consolidated SELECT policy for authenticated", () => {
        expect(norm()).toContain(
          `create policy ${create} on public.${table} for select to authenticated using (`
        );
      });

      it("OR's every original tier into the consolidated predicate", () => {
        for (const tier of tiers) {
          expect(norm()).toContain(tier);
        }
      });
    });
  }
});

describe("consolidate-select-rls migration — whole file", () => {
  it("consolidates all 15 flagged tables (15 creates, 32 drops)", () => {
    expect((lower().match(/create policy /g) ?? []).length).toBe(15);
    expect((lower().match(/drop policy if exists /g) ?? []).length).toBe(32);
  });

  it("adds the two real FK-join covering indexes", () => {
    expect(norm()).toContain(
      "create index if not exists idx_leader_pipeline_member on public.leader_pipeline (member_id)"
    );
    expect(norm()).toContain(
      "create index if not exists idx_multiplication_candidates_leader_pipeline on public.multiplication_candidates (leader_pipeline_id)"
    );
  });

  it("never references service_role (no privilege escalation)", () => {
    expect(lower()).not.toContain("service_role");
  });
});
