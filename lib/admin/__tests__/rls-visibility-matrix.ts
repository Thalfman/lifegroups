// ===========================================================================
// The RLS read-visibility MATRIX — the machine-readable "what each tier can
// and cannot SELECT" table, extracted from the sweep test so other checks can
// consume it (tests/fitness/rls-visibility-doc-sync.test.ts asserts the
// human-readable docs/architecture/RLS_VISIBILITY.md never lags this matrix).
// The sweep test (./admin-rls-visibility-sweep.test.ts) remains the enforcing
// consumer: it asserts coverage (every RLS-enabled table is classified) and
// checks each entry against its authoritative migration.
// ===========================================================================

export type VisibilityClass =
  | "ADMIN_READ"
  | "CONFIG_SCOPED"
  | "SUPER_ADMIN_ONLY"
  | "LEADER_SCOPED"
  | "OVER_SHEPHERD_SCOPED"
  | "CARE_NOTE_EXCEPTION"
  | "PRIVATE_NOTE_EXCEPTION"
  | "NO_READ";

export interface RlsExpectation {
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
  accountDeletion: "20260704000000_account_deletion_requests.sql",
  firstRunOrientation: "20260705000000_first_run_orientation.sql",
  collapseCells: "20260708000000_collapse_cells_to_group_type_list.sql",
  irreversibleProfileErasure: "20260718010000_irreversible_profile_erasure.sql",
  // #860: recreated every in-force SELECT policy that called a no-arg helper
  // bare, adding only the `(select …)` InitPlan wrapping — so it is now the
  // last writer for those policies. Entries below point here so the sweep
  // validates the LIVE predicate, not the superseded pre-wrap text. (The four
  // group-catalog tables dropped by collapseCells and the two SC.4
  // creator-scoped policies were not recreated and keep their old pointers.)
  initplanWrap: "20260714010000_rls_initplan_wrap_noarg_helpers.sql",
  // #866 last-writes the 11 leader-scoped policies plus profiles after
  // replacing only the dead admin-or-staff helper with the wrapped admin helper.
  staffViewerCollapse: "20260717000000_collapse_staff_viewer_helpers.sql",
} as const;

// Token bundles shared by a whole class. Helper calls appear in their #860/#866
// InitPlan-wrapped form — `(select public.helper())` — where the wrapping
// changes the surrounding text a token pins.
const ADMIN = ["auth_is_admin"] as const;
const SUPER = ["(select public.auth_role()) = 'super_admin'"] as const;
const LEADER = [
  "(select public.auth_is_admin())",
  "auth_is_leader_of",
] as const;
const CARE_NOTE = [
  "author_profile_id = (select public.auth_profile_id())",
  "public.auth_is_admin()",
  "note_transparency_grants g",
  "g.granted",
] as const;
const PRIVATE = [
  "created_by_profile_id = public.auth_profile_id()",
  "ministry_admin",
] as const;

export const MATRIX: readonly RlsExpectation[] = [
  // --- ADMIN_READ: both admins read all; nothing below the admin tier. -------
  {
    table: "group_metric_settings",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "group_metric_settings_admin_read",
    expect: ADMIN,
  },
  {
    table: "shepherd_care_admin_notes",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "shepherd_care_admin_notes_admin_select",
    expect: ADMIN,
  },
  {
    table: "shepherd_care_follow_ups",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "shepherd_care_follow_ups_admin_select",
    expect: ADMIN,
  },
  {
    table: "leader_pipeline",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
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
    authoritativeMigration: M.initplanWrap,
    policyName: "member_care_profiles_admin_select",
    expect: ADMIN,
  },
  {
    table: "member_care_interactions",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "member_care_interactions_admin_select",
    expect: ADMIN,
  },
  {
    table: "health_rubrics",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "health_rubrics_admin_read",
    expect: ADMIN,
  },
  {
    table: "prospects",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "prospects_admin_read",
    expect: ADMIN,
  },
  {
    table: "leader_rubric_grades",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "leader_rubric_grades_admin_read",
    expect: ADMIN,
  },
  {
    table: "group_rubric_grades",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "group_rubric_grades_admin_read",
    expect: ADMIN,
  },
  {
    table: "group_health_assessments",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "group_health_assessments_admin_read",
    expect: ADMIN,
  },
  {
    table: "church_attendance_snapshots",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "church_attendance_snapshots_admin_read",
    expect: ADMIN,
  },
  {
    table: "multiplication_candidates",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
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
    authoritativeMigration: M.initplanWrap,
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
    // The free-text group-type config table (collapse-cells migration). Admin-
    // only read; the old per-cell tables above are dropped by the same migration
    // but their RLS-enable statements remain in migration history, so they stay
    // classified here too.
    table: "group_type_configs",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "group_type_configs_admin_read",
    expect: ADMIN,
  },
  {
    table: "over_shepherds",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "over_shepherds_admin_select",
    expect: ADMIN,
  },
  {
    table: "launch_planning_scenarios",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "launch_planning_scenarios_admin_select",
    expect: ADMIN,
  },
  {
    table: "attention_reset_baselines",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "attention_reset_baselines_admin_read",
    expect: ADMIN,
  },
  {
    table: "activity_reset_baselines",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
    policyName: "activity_reset_baselines_admin_read",
    expect: ADMIN,
  },
  // The transparency-grant toggle table itself is admin-only (no lower tier).
  {
    table: "note_transparency_grants",
    cls: "ADMIN_READ",
    authoritativeMigration: M.initplanWrap,
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
    authoritativeMigration: M.initplanWrap,
    policyName: "app_settings_read",
    expect: ["public.auth_is_admin()", "setting_key = 'metric_defaults'"],
    forbid: ["auth.uid()", "auth_is_leader_of", "launch_planning_assumptions"],
  },

  // --- SUPER_ADMIN_ONLY: Ministry Admin excluded (audit trail + danger zone). -
  {
    table: "audit_events",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "audit_events_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "audit_events_archive",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "audit_events_archive_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "platform_config",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "platform_config_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "usage_events",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "usage_events_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "invitations",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "invitations_super_admin_select",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "tombstones",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "tombstones_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "clean_slate_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "clean_slate_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "history_reset_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "history_reset_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  {
    table: "attention_reset_snapshots",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "attention_reset_snapshots_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },
  // Self-service deletion requests: the danger-zone operator reviews them and
  // performs the permanent purge; Ministry Admin is sealed out (#563).
  {
    table: "account_deletion_requests",
    cls: "SUPER_ADMIN_ONLY",
    authoritativeMigration: M.initplanWrap,
    policyName: "account_deletion_requests_super_admin_read",
    expect: SUPER,
    forbid: ["auth_is_admin"],
  },

  // --- LEADER_SCOPED: admins read all; a leader reads their group's rows. -----
  {
    table: "groups",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "groups_read",
    expect: LEADER,
  },
  {
    table: "group_leaders",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "group_leaders_read",
    expect: LEADER,
  },
  {
    table: "members",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "members_read",
    expect: LEADER,
  },
  {
    table: "group_memberships",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "group_memberships_read",
    expect: LEADER,
  },
  {
    table: "attendance_sessions",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "attendance_sessions_read",
    expect: LEADER,
  },
  {
    table: "attendance_records",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "attendance_records_read",
    expect: LEADER,
  },
  {
    table: "guests",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "guests_read",
    expect: LEADER,
  },
  {
    table: "follow_ups",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "follow_ups_read",
    expect: LEADER,
  },
  {
    table: "group_health_updates",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "group_health_updates_read",
    expect: LEADER,
  },
  {
    table: "group_status_history",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "group_status_history_read",
    expect: LEADER,
  },
  {
    table: "group_calendar_events",
    cls: "LEADER_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "group_calendar_events_read",
    expect: LEADER,
  },

  // --- OVER_SHEPHERD_SCOPED: admins read all; an OS reads their coverage. -----
  {
    table: "profiles",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.staffViewerCollapse,
    policyName: "profiles_read",
    expect: [
      "(select public.auth_is_admin())",
      "over_shepherd_covered_profile_ids",
    ],
  },
  {
    table: "shepherd_care_profiles",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.initplanWrap,
    policyName: "shepherd_care_profiles_select",
    expect: ["auth_is_admin()", "over_shepherd_covered_profile_ids"],
  },
  {
    table: "shepherd_care_interactions",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.initplanWrap,
    policyName: "shepherd_care_interactions_select",
    expect: ["auth_is_admin()", "over_shepherd_covered_profile_ids"],
  },
  {
    table: "shepherd_coverage_assignments",
    cls: "OVER_SHEPHERD_SCOPED",
    authoritativeMigration: M.initplanWrap,
    policyName: "shepherd_coverage_assignments_select",
    expect: ["auth_is_admin()", "auth_over_shepherd_id"],
  },

  // --- CARE_NOTE_EXCEPTION: author always; ladder only on the SAME grant. -----
  {
    table: "care_notes",
    cls: "CARE_NOTE_EXCEPTION",
    authoritativeMigration: M.initplanWrap,
    policyName: "care_notes_author_or_granted_select",
    expect: CARE_NOTE,
  },
  {
    table: "prayer_requests",
    cls: "CARE_NOTE_EXCEPTION",
    authoritativeMigration: M.initplanWrap,
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
  // Per-user first-run orientation dismissals: read + written only via the
  // SECURITY DEFINER RPCs, never SELECTed directly (#560).
  {
    table: "first_run_orientations",
    cls: "NO_READ",
    authoritativeMigration: M.firstRunOrientation,
  },
  // Cross-system Auth purge retry seam: service-role only, with no user
  // SELECT policy. The pending Auth UUID is cleared when completion is audited.
  {
    table: "profile_auth_purge_jobs",
    cls: "NO_READ",
    authoritativeMigration: M.irreversibleProfileErasure,
  },
];
