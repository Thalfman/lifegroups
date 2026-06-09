import { describe, expect, it } from "vitest";

import {
  effectiveSelectPolicies,
  listMigrations,
  loadMigration,
  selectPolicies,
  type MigrationSql,
  type ParsedPolicy,
} from "./migration-safety";

// ===========================================================================
// Admin RLS read-visibility sweep — the single source of truth for "what each
// tier can and cannot SELECT".
//
// This is the matrix-driven regression net for the admin RLS visibility audit:
// "everything an admin should see, they can; everything they shouldn't, they
// can't." CI has no Postgres (RLS is verified manually per supabase/dev/README),
// so — like the per-migration suites — it asserts statically over the migration
// SQL, reusing the lib/admin/__tests__/migration-safety helpers.
//
// Two mechanisms, kept separate on purpose:
//   1. COVERAGE GUARD — every table with RLS enabled must appear in MATRIX. A
//      future migration that enables RLS on a new table without classifying its
//      visibility here fails the build. This is how the policy stays tied down
//      going forward.
//   2. PER-TABLE ASSERTIONS — each table's SELECT policy is checked against its
//      declared class, pinned to the AUTHORITATIVE migration (the last writer),
//      so a dropped or pre-consolidation policy never gives false confidence.
//      Cross-migration overrides (audit_events, the perf consolidation, the
//      pivot11 care-note arm) are resolved via effectiveSelectPolicies where the
//      negative ladder needs the post-override state.
//
// Visibility classes (who may SELECT):
//   ADMIN_READ            — both admins (auth_is_admin / auth_is_admin_or_staff).
//   CONFIG_SCOPED         — admins read all keys; non-admins read one shared key.
//   SUPER_ADMIN_ONLY      — super_admin only; Ministry Admin EXCLUDED.
//   LEADER_SCOPED         — admins read all; a leader reads their group's rows.
//   OVER_SHEPHERD_SCOPED  — admins read all; an Over-Shepherd reads coverage.
//   CARE_NOTE_EXCEPTION   — author always; ladder only on the SAME active grant.
//   PRIVATE_NOTE_EXCEPTION— creator-only ministry_admin; Super Admin EXCLUDED.
//   NO_READ               — RLS on, NO SELECT policy; RPC-only reads.
// ===========================================================================

type VisibilityClass =
  | "ADMIN_READ"
  | "CONFIG_SCOPED"
  | "SUPER_ADMIN_ONLY"
  | "LEADER_SCOPED"
  | "OVER_SHEPHERD_SCOPED"
  | "CARE_NOTE_EXCEPTION"
  | "PRIVATE_NOTE_EXCEPTION"
  | "NO_READ";

interface RlsExpectation {
  readonly table: string;
  readonly cls: VisibilityClass;
  /** The migration whose SELECT policy is authoritative (the last writer). */
  readonly authoritativeMigration: string;
  /** Policy name to find in that migration (omitted for NO_READ). */
  readonly policyName?: string;
  /** Lowercased substrings the authoritative predicate MUST contain. */
  readonly expect?: readonly string[];
  /** Lowercased substrings the authoritative predicate MUST NOT contain. */
  readonly forbid?: readonly string[];
}

// Authoritative-migration file names (centralised so a rename is a one-line fix).
const M = {
  base: "20260518000000_phase4_rls.sql",
  auditOverride: "20260518060000_phase5a2_admin_group_writes.sql",
  settings: "20260518100000_phase5a4_settings_and_role.sql",
  overShepherdCoverage: "20260518170000_phase5d1_over_shepherd_coverage.sql",
  lp2: "20260518200000_phase_lp2_launch_planning_scenarios.sql",
  churchAttendance: "20260528140000_julian_p2_church_attendance.sql",
  multCandidates: "20260528160000_julian_p4b_multiplication_pipeline.sql",
  fenceAdminSummary: "20260529004000_phase_os5_fence_admin_summary.sql",
  careFollowUps: "20260529007000_phase_sc1b_shepherd_care_follow_ups.sql",
  privateNotes: "20260529008000_phase_sc4_private_care_notes.sql",
  healthAssessments: "20260530010000_phase_gh1_group_health_assessments.sql",
  sac1: "20260531000000_phase_sac1_super_admin_console_foundation.sql",
  leaderPipeline: "20260531100000_julian_cap1_leader_pipeline.sql",
  consolidate: "20260602020000_perf_consolidate_select_rls_policies.sql",
  cleanSlate: "20260603130000_phase_sac6_clean_slate_history_wipe.sql",
  resetAuditLogs: "20260603140000_phase_sac6_reset_audit_logs.sql",
  permanentDeletion:
    "20260604010000_phase_sad1_permanent_deletion_foundation.sql",
  historyReset: "20260604080000_phase_sac6_history_reset_category.sql",
  inviteLinks: "20260604120000_phase_il1_shareable_invite_links.sql",
  inviteThrottle: "20260604130000_phase_il2_invite_redeem_throttle.sql",
  attentionReset: "20260605120000_phase_sac6_attention_reset_baseline.sql",
  activityReset: "20260607120000_activity_reset_baseline.sql",
  healthRubric: "20260608010000_phase_pivot3_health_rubric.sql",
  prospects: "20260608020000_phase_pivot6_prospects.sql",
  groupHealthGrade: "20260608050000_phase_pivot4_group_health_grade_care.sql",
  leaderHealth: "20260608060000_phase_pivot5_leader_health.sql",
  multPillars: "20260608080000_phase_pivot8_multiplication_pillars.sql",
  careNotes: "20260608090000_phase_pivot9_care_notes.sql",
  leaderGroupNotes: "20260608100000_phase_pivot11_leader_group_notes.sql",
  categories: "20260610000000_phase_groups1_category_catalog_and_matrix.sql",
  readinessRule:
    "20260615000000_phase_groups5_readiness_rule_and_overrides.sql",
  audienceReadiness: "20260616000000_phase_groups6_per_type_readiness_rule.sql",
  memberCare: "20260624000000_phase_care_member_list_foundation.sql",
  usage: "20260628000000_phase_usage_tracking.sql",
  appSettingsSeal: "20260629000000_seal_app_settings_to_admin.sql",
} as const;

// Token bundles shared by a whole class.
const ADMIN = ["auth_is_admin"] as const; // matches auth_is_admin() + _or_staff()
const SUPER = ["auth_role() = 'super_admin'"] as const;
const LEADER = ["auth_is_admin_or_staff()", "auth_is_leader_of"] as const;
const CARE_NOTE = [
  "author_profile_id = public.auth_profile_id()",
  "public.auth_is_admin()",
  "note_transparency_grants g",
  "g.granted",
] as const;
const PRIVATE = [
  "created_by_profile_id = public.auth_profile_id()",
  "ministry_admin",
] as const;

const MATRIX: readonly RlsExpectation[] = [
  // --- ADMIN_READ: both admins read all; nothing below the admin tier. -------
  {
    table: "group_metric_settings",
    cls: "ADMIN_READ",
    authoritativeMigration: M.settings,
    policyName: "group_metric_settings_admin_read",
    expect: ADMIN,
  },
  {
    table: "shepherd_care_admin_notes",
    cls: "ADMIN_READ",
    authoritativeMigration: M.fenceAdminSummary,
    policyName: "shepherd_care_admin_notes_admin_select",
    expect: ADMIN,
  },
  {
    table: "shepherd_care_follow_ups",
    cls: "ADMIN_READ",
    authoritativeMigration: M.careFollowUps,
    policyName: "shepherd_care_follow_ups_admin_select",
    expect: ADMIN,
  },
  {
    table: "leader_pipeline",
    cls: "ADMIN_READ",
    authoritativeMigration: M.leaderPipeline,
    policyName: "leader_pipeline_admin_read",
    expect: ADMIN,
  },
  {
    table: "group_categories",
    cls: "ADMIN_READ",
    authoritativeMigration: M.categories,
    policyName: "group_categories_admin_read",
    expect: ADMIN,
  },
  {
    table: "category_type_targets",
    cls: "ADMIN_READ",
    authoritativeMigration: M.categories,
    policyName: "category_type_targets_admin_read",
    expect: ADMIN,
  },
  {
    table: "member_care_profiles",
    cls: "ADMIN_READ",
    authoritativeMigration: M.memberCare,
    policyName: "member_care_profiles_admin_select",
    expect: ADMIN,
  },
  {
    table: "member_care_interactions",
    cls: "ADMIN_READ",
    authoritativeMigration: M.memberCare,
    policyName: "member_care_interactions_admin_select",
    expect: ADMIN,
  },
  {
    table: "health_rubrics",
    cls: "ADMIN_READ",
    authoritativeMigration: M.healthRubric,
    policyName: "health_rubrics_admin_read",
    expect: ADMIN,
  },
  {
    table: "prospects",
    cls: "ADMIN_READ",
    authoritativeMigration: M.prospects,
    policyName: "prospects_admin_read",
    expect: ADMIN,
  },
  {
    table: "leader_rubric_grades",
    cls: "ADMIN_READ",
    authoritativeMigration: M.leaderHealth,
    policyName: "leader_rubric_grades_admin_read",
    expect: ADMIN,
  },
  {
    table: "group_rubric_grades",
    cls: "ADMIN_READ",
    authoritativeMigration: M.groupHealthGrade,
    policyName: "group_rubric_grades_admin_read",
    expect: ADMIN,
  },
  {
    table: "group_health_assessments",
    cls: "ADMIN_READ",
    authoritativeMigration: M.healthAssessments,
    policyName: "group_health_assessments_admin_read",
    expect: ADMIN,
  },
  {
    table: "church_attendance_snapshots",
    cls: "ADMIN_READ",
    authoritativeMigration: M.churchAttendance,
    policyName: "church_attendance_snapshots_admin_read",
    expect: ADMIN,
  },
  {
    table: "multiplication_candidates",
    cls: "ADMIN_READ",
    authoritativeMigration: M.multCandidates,
    policyName: "multiplication_candidates_admin_read",
    expect: ADMIN,
  },
  {
    table: "multiplication_config",
    cls: "ADMIN_READ",
    authoritativeMigration: M.multPillars,
    policyName: "multiplication_config_admin_read",
    expect: ADMIN,
  },
  {
    table: "multiplication_readiness_rule",
    cls: "ADMIN_READ",
    authoritativeMigration: M.readinessRule,
    policyName: "multiplication_readiness_rule_admin_read",
    expect: ADMIN,
  },
  {
    table: "audience_readiness_rule",
    cls: "ADMIN_READ",
    authoritativeMigration: M.audienceReadiness,
    policyName: "audience_readiness_rule_admin_read",
    expect: ADMIN,
  },
  {
    table: "over_shepherds",
    cls: "ADMIN_READ",
    authoritativeMigration: M.overShepherdCoverage,
    policyName: "over_shepherds_admin_select",
    expect: ADMIN,
  },
  {
    table: "launch_planning_scenarios",
    cls: "ADMIN_READ",
    authoritativeMigration: M.lp2,
    policyName: "launch_planning_scenarios_admin_select",
    expect: ADMIN,
  },
  {
    table: "attention_reset_baselines",
    cls: "ADMIN_READ",
    authoritativeMigration: M.attentionReset,
    policyName: "attention_reset_baselines_admin_read",
    expect: ADMIN,
  },
  {
    table: "activity_reset_baselines",
    cls: "ADMIN_READ",
    authoritativeMigration: M.activityReset,
    policyName: "activity_reset_baselines_admin_read",
    expect: ADMIN,
  },
  // The transparency-grant toggle table itself is admin-only (no lower tier).
  {
    table: "note_transparency_grants",
    cls: "ADMIN_READ",
    authoritativeMigration: M.careNotes,
    policyName: "note_transparency_grants_admin_select",
    expect: ADMIN,
    forbid: ["over_shepherd", "auth_role() = 'leader'"],
  },
  // app_settings: per-key scope (audit fix). Admins read all keys; non-admins
  // read ONLY the shared metric_defaults thresholds. launch_planning_assumptions
  // (the leak) and group_health_rubric stay admin-only; future keys default-deny.
  {
    table: "app_settings",
    cls: "CONFIG_SCOPED",
    authoritativeMigration: M.appSettingsSeal,
    policyName: "app_settings_read",
    expect: ["public.auth_is_admin()", "setting_key = 'metric_defaults'"],
    forbid: ["auth.uid()", "auth_is_leader_of", "launch_planning_assumptions"],
  },

  // --- SUPER_ADMIN_ONLY: Ministry Admin excluded (audit trail + danger zone). -
  {
    table: "audit_events",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.auditOverride,
    policyName: "audit_events_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "audit_events_archive",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.resetAuditLogs,
    policyName: "audit_events_archive_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "platform_config",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.sac1,
    policyName: "platform_config_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "usage_events",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.usage,
    policyName: "usage_events_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "invitations",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.inviteLinks,
    policyName: "invitations_super_admin_select",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "tombstones",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.permanentDeletion,
    policyName: "tombstones_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "clean_slate_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.cleanSlate,
    policyName: "clean_slate_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "history_reset_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.historyReset,
    policyName: "history_reset_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "attention_reset_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.attentionReset,
    policyName: "attention_reset_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },

  // --- LEADER_SCOPED: admins read all; a leader reads their group's rows. -----
  {
    table: "groups",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "groups_read",
    expect: LEADER,
  },
  {
    table: "group_leaders",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "group_leaders_read",
    expect: LEADER,
  },
  {
    table: "members",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "members_read",
    expect: LEADER,
  },
  {
    table: "group_memberships",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "group_memberships_read",
    expect: LEADER,
  },
  {
    table: "attendance_sessions",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "attendance_sessions_read",
    expect: LEADER,
  },
  {
    table: "attendance_records",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "attendance_records_read",
    expect: LEADER,
  },
  {
    table: "guests",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "guests_read",
    expect: LEADER,
  },
  {
    table: "follow_ups",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "follow_ups_read",
    expect: LEADER,
  },
  {
    table: "group_health_updates",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "group_health_updates_read",
    expect: LEADER,
  },
  {
    table: "group_status_history",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "group_status_history_read",
    expect: LEADER,
  },
  {
    table: "group_calendar_events",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "group_calendar_events_read",
    expect: LEADER,
  },

  // --- OVER_SHEPHERD_SCOPED: admins read all; an OS reads their coverage. -----
  {
    table: "profiles",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "profiles_read",
    expect: ["auth_is_admin_or_staff()", "over_shepherd_covered_profile_ids"],
  },
  {
    table: "shepherd_care_profiles",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "shepherd_care_profiles_select",
    expect: ["auth_is_admin()", "over_shepherd_covered_profile_ids"],
  },
  {
    table: "shepherd_care_interactions",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "shepherd_care_interactions_select",
    expect: ["auth_is_admin()", "over_shepherd_covered_profile_ids"],
  },
  {
    table: "shepherd_coverage_assignments",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.consolidate,
    policyName: "shepherd_coverage_assignments_select",
    expect: ["auth_is_admin()", "auth_over_shepherd_id"],
  },

  // --- CARE_NOTE_EXCEPTION: author always; ladder only on the SAME grant. -----
  {
    table: "care_notes",
    cls: "CARE_NOTE_EXCEPTION",
    authoritativeMigration: M.leaderGroupNotes,
    policyName: "care_notes_author_or_granted_select",
    expect: CARE_NOTE,
  },
  {
    table: "prayer_requests",
    cls: "CARE_NOTE_EXCEPTION",
    authoritativeMigration: M.leaderGroupNotes,
    policyName: "prayer_requests_author_or_granted_select",
    expect: CARE_NOTE,
  },

  // --- PRIVATE_NOTE_EXCEPTION: creator-only; Super Admin excluded. ------------
  {
    table: "shepherd_care_private_notes",
    cls: "PRIVATE_NOTE_EXCEPTION",
    authoritativeMigration: M.privateNotes,
    policyName: "shepherd_care_private_notes_creator_select",
    expect: PRIVATE,
    forbid: ["auth_is_admin", "super_admin"],
  },
  {
    table: "shepherd_care_note_key_slots",
    cls: "PRIVATE_NOTE_EXCEPTION",
    authoritativeMigration: M.privateNotes,
    policyName: "shepherd_care_note_key_slots_creator_select",
    expect: PRIVATE,
    forbid: ["auth_is_admin", "super_admin"],
  },

  // --- NO_READ: RLS on, no SELECT policy; RPC-only. --------------------------
  {
    table: "invite_redeem_throttle",
    cls: "NO_READ",
    authoritativeMigration: M.inviteThrottle,
  },
];

const ALL: readonly MigrationSql[] = listMigrations().map(loadMigration);

function authoritativePolicy(entry: RlsExpectation): ParsedPolicy | undefined {
  return selectPolicies(
    loadMigration(entry.authoritativeMigration),
    entry.table
  ).find((p) => p.name === entry.policyName);
}

describe("admin RLS visibility sweep — coverage guard", () => {
  it("classifies exactly the set of RLS-enabled tables", () => {
    const enabled = [...tablesEnabled()].sort();
    const classified = [...new Set(MATRIX.map((e) => e.table))].sort();

    const unclassified = enabled.filter((t) => !classified.includes(t));
    const stale = classified.filter((t) => !enabled.includes(t));

    expect(
      unclassified,
      "RLS is enabled on these table(s) but they are not in MATRIX — classify each one's read visibility in admin-rls-visibility-sweep.test.ts"
    ).toEqual([]);
    expect(
      stale,
      "these MATRIX table(s) no longer have RLS enabled — remove or update their entry"
    ).toEqual([]);
  });

  it("has no duplicate table entries", () => {
    const seen = MATRIX.map((e) => e.table);
    expect(seen.length).toBe(new Set(seen).size);
  });

  function tablesEnabled(): Set<string> {
    // Local re-import to keep the helper name close to the assertion.
    const re = /alter table\s+(?:public\.)?(\w+)\s+enable row level security/g;
    const out = new Set<string>();
    for (const m of ALL)
      for (const match of m.lower.matchAll(re)) out.add(match[1]);
    return out;
  }
});

describe.each(MATRIX)("$table [$cls]", (entry) => {
  if (entry.cls === "NO_READ") {
    it("has RLS enabled but NO SELECT policy anywhere (RPC-only)", () => {
      const anySelect = ALL.flatMap((m) => selectPolicies(m, entry.table));
      expect(
        anySelect.map((p) => p.name),
        `${entry.table} should be RPC-only — found a SELECT policy`
      ).toEqual([]);
    });
    return;
  }

  it(`defines its authoritative SELECT policy (${entry.policyName})`, () => {
    expect(
      authoritativePolicy(entry),
      `${entry.policyName} on ${entry.table} should exist in ${entry.authoritativeMigration}`
    ).toBeDefined();
  });

  it("requires the expected predicate tokens (positive: can read)", () => {
    const predicate = authoritativePolicy(entry)?.predicate ?? "";
    for (const token of entry.expect ?? [])
      expect(
        predicate,
        `${entry.table} predicate should contain "${token}"`
      ).toContain(token);
  });

  it("forbids the forbidden predicate tokens (negative: cannot read)", () => {
    const predicate = authoritativePolicy(entry)?.predicate ?? "";
    for (const token of entry.forbid ?? [])
      expect(
        predicate,
        `${entry.table} predicate should NOT contain "${token}"`
      ).not.toContain(token);
  });

  if (entry.cls === "SUPER_ADMIN_ONLY") {
    it("has no surviving bare-admin SELECT policy (Ministry Admin sealed out)", () => {
      const live = effectiveSelectPolicies(ALL, entry.table);
      // Every still-in-effect SELECT policy must gate on super_admin, never on
      // the bare admin helper (which would re-admit Ministry Admin).
      for (const policy of live)
        expect(
          policy.predicate,
          `${entry.table} has a surviving SELECT policy "${policy.name}" using auth_is_admin — Ministry Admin would be re-admitted`
        ).not.toContain("auth_is_admin");
      expect(
        live.map((p) => p.name),
        `${entry.table} should have a super-admin SELECT policy in effect`
      ).toContain(entry.policyName);
    });
  }

  if (entry.cls === "CARE_NOTE_EXCEPTION") {
    it("conjoins the admin arm with the grant (no bare 'or auth_is_admin()')", () => {
      const predicate = authoritativePolicy(entry)?.predicate ?? "";
      // A bare disjunctive admin read would let the ladder (or super_admin) read
      // a sealed note. The admin arm must always be AND-ed with the grant EXISTS.
      expect(predicate).not.toMatch(/or\s+public\.auth_is_admin\(\)\s*\)/);
    });
  }
});
