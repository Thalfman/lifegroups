import type {
  ActivityResetBaselinesRow,
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  AttentionResetBaselinesRow,
  AttentionResetSnapshotsRow,
  AuditEventsRow,
  CareNotesRow,
  ChurchAttendanceSnapshotsRow,
  CleanSlateSnapshotsRow,
  FollowUpsRow,
  GroupCalendarEventsRow,
  GroupHealthAssessmentsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupRubricGradesRow,
  GroupStatusHistoryRow,
  GroupTypeConfigsRow,
  GroupsRow,
  GuestsRow,
  HealthRubricsRow,
  HistoryResetSnapshotsRow,
  InvitationsRow,
  LaunchPlanningScenariosRow,
  LeaderPipelineRow,
  LeaderRubricGradesRow,
  MembersRow,
  ProfileAuthPurgeJobsRow,
  MultiplicationCandidatesRow,
  MultiplicationReadinessRuleRow,
  NoteTransparencyGrantsRow,
  OverShepherdsRow,
  PlatformConfigRow,
  PrayerRequestsRow,
  ProfilesRow,
  ProspectsRow,
  ShepherdCareAdminNotesRow,
  ShepherdCareFollowUpsRow,
  ShepherdCareInteractionsRow,
  ShepherdCareNoteKeySlotsRow,
  ShepherdCarePrivateNotesRow,
  ShepherdCareProfilesRow,
  ShepherdCoverageAssignmentsRow,
  TombstonesRow,
  UsageEventsRow,
} from "@/types/database";
import type * as E from "@/types/enums";
// Type-only import (erased at compile time), so the module's "server-only"
// guard never executes in the vitest process.
import type { LatestFollowUpRow } from "@/lib/admin/group-health-read";

// Compile-time-pinned manifest for the types-drift guard (issue #864).
//
// The hand-rolled `types/` trust boundary is only trustworthy while it matches
// the live migrated schema. This manifest freezes the STRUCTURAL facts of that
// boundary — every `<Table>Row` key set for the read-path tables, and every
// string-literal union that mirrors a Postgres enum — in a shape the RLS
// integration lane (`tests/integration/types-drift.test.ts`) can diff against
// `information_schema` / `pg_enum` on the local stack.
//
// Two-way COMPILE safety: each key/value map is typed `Record<keyof Row, true>`
// (resp. `Record<Union, true>`), so a key removed from the Row interface makes
// the map fail `tsc` (missing property) and a key that no longer exists on the
// Row fails too (excess property). Editing types/database.ts or types/enums.ts
// therefore forces the matching manifest edit, and the integration spec then
// proves the edit against the real database.
//
// SCOPE: TABLE_ROW_KEYS pins every table the app READS at runtime via
// PostgREST (`.from("…")` in lib/** and app/** — the `*_COLUMNS` allowlist
// tables plus the danger-zone/settings read models). Tables deliberately NOT
// guarded live in UNGUARDED_TABLES with a reason each, and the spec asserts
// every live `public` base table lands in exactly one of the two lists — a
// new table can never silently fall through. VIEWS get the same treatment:
// PostgREST view reads carry hand-rolled row types that bypass
// types/database.ts entirely, so VIEW_ROW_KEYS pins each read view against
// its live column set and UNGUARDED_VIEWS holds the deliberate exclusions
// (the spec closes coverage over live views too). Enums cover every union in
// types/enums.ts that mirrors a Postgres enum type, plus the inline
// HealthRubricsRow["kind"] union (db enum health_rubric_kind).
// GroupHealthLetter / LeaderHealthLetter are deliberately absent: their
// columns are `text` with CHECK constraints in Postgres (see
// 20260608010000/20260608050000/20260608060000), not enum types.

/** Pin a Row interface's full key set; both drift directions fail `tsc`. */
const rowKeys =
  <Row>() =>
  (map: Record<keyof Row & string, true>): readonly (keyof Row & string)[] =>
    Object.keys(map) as (keyof Row & string)[];

/** Pin a string-literal union's full value set; both directions fail `tsc`. */
const enumValues = <Union extends string>(
  map: Record<Union, true>
): readonly Union[] => Object.keys(map) as Union[];

export interface TableManifestEntry {
  /** The `types/database.ts` interface name, for failure messages. */
  readonly rowType: string;
  /** The pinned key set of that interface. */
  readonly keys: readonly string[];
}

export const TABLE_ROW_KEYS: Readonly<Record<string, TableManifestEntry>> = {
  profiles: {
    rowType: "ProfilesRow",
    keys: rowKeys<ProfilesRow>()({
      id: true,
      auth_user_id: true,
      full_name: true,
      full_name_pending: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      created_at: true,
      updated_at: true,
    }),
  },
  groups: {
    rowType: "GroupsRow",
    keys: rowKeys<GroupsRow>()({
      id: true,
      name: true,
      description: true,
      meeting_day: true,
      meeting_time: true,
      meeting_frequency: true,
      meeting_week_parity: true,
      location_area: true,
      address_optional: true,
      capacity: true,
      lifecycle_status: true,
      health_status: true,
      group_type: true,
      launched_on: true,
      pause_reason: true,
      pause_start_date: true,
      expected_return_date: true,
      restart_reminder_date: true,
      admin_notes: true,
      created_at: true,
      updated_at: true,
      closed_at: true,
    }),
  },
  group_leaders: {
    rowType: "GroupLeadersRow",
    keys: rowKeys<GroupLeadersRow>()({
      id: true,
      group_id: true,
      profile_id: true,
      role: true,
      assigned_at: true,
      active: true,
      created_at: true,
    }),
  },
  group_memberships: {
    rowType: "GroupMembershipsRow",
    keys: rowKeys<GroupMembershipsRow>()({
      id: true,
      group_id: true,
      member_id: true,
      role: true,
      status: true,
      joined_at: true,
      ended_at: true,
      created_at: true,
    }),
  },
  members: {
    rowType: "MembersRow",
    keys: rowKeys<MembersRow>()({
      id: true,
      full_name: true,
      email: true,
      phone: true,
      household_name: true,
      status: true,
      care_sensitivity_flag: true,
      created_at: true,
      updated_at: true,
    }),
  },
  attendance_sessions: {
    rowType: "AttendanceSessionsRow",
    keys: rowKeys<AttendanceSessionsRow>()({
      id: true,
      group_id: true,
      meeting_week: true,
      meeting_date: true,
      status: true,
      submitted_by: true,
      submitted_at: true,
      leader_note: true,
      admin_note: true,
      created_at: true,
      updated_at: true,
    }),
  },
  attendance_records: {
    rowType: "AttendanceRecordsRow",
    keys: rowKeys<AttendanceRecordsRow>()({
      id: true,
      session_id: true,
      member_id: true,
      attendance_status: true,
      created_at: true,
    }),
  },
  group_health_assessments: {
    rowType: "GroupHealthAssessmentsRow",
    keys: rowKeys<GroupHealthAssessmentsRow>()({
      id: true,
      group_id: true,
      period_month: true,
      attendance_pct: true,
      attendance_weeks_counted: true,
      spiritual_growth_score: true,
      spiritual_growth_note: true,
      group_question_score: true,
      group_question_leader_reported: true,
      computed_numeric: true,
      computed_letter: true,
      override_letter: true,
      override_scope: true,
      override_reason: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
      needs_follow_up: true,
    }),
  },
  group_health_updates: {
    rowType: "GroupHealthUpdatesRow",
    keys: rowKeys<GroupHealthUpdatesRow>()({
      id: true,
      group_id: true,
      submitted_by: true,
      update_week: true,
      pulse: true,
      follow_up_needed: true,
      leader_note: true,
      admin_note: true,
      created_at: true,
    }),
  },
  group_calendar_events: {
    rowType: "GroupCalendarEventsRow",
    keys: rowKeys<GroupCalendarEventsRow>()({
      id: true,
      group_id: true,
      event_date: true,
      start_time: true,
      end_time: true,
      event_type: true,
      status: true,
      title: true,
      description: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
      archived_at: true,
    }),
  },
  app_settings: {
    rowType: "AppSettingsRow",
    keys: rowKeys<AppSettingsRow>()({
      id: true,
      setting_key: true,
      setting_value: true,
      created_at: true,
      updated_at: true,
    }),
  },
  group_metric_settings: {
    rowType: "GroupMetricSettingsRow",
    keys: rowKeys<GroupMetricSettingsRow>()({
      group_id: true,
      capacity_override: true,
      capacity_warning_threshold_pct_override: true,
      healthy_attendance_pct_override: true,
      manual_health_status_override: true,
      exclude_from_capacity_metrics: true,
      admin_metric_notes: true,
      check_in_due_offset_hours_override: true,
      allow_over_capacity: true,
      created_at: true,
      updated_at: true,
    }),
  },
  follow_ups: {
    rowType: "FollowUpsRow",
    keys: rowKeys<FollowUpsRow>()({
      id: true,
      type: true,
      title: true,
      related_group_id: true,
      related_member_id: true,
      related_guest_id: true,
      assigned_to: true,
      priority: true,
      due_date: true,
      status: true,
      leader_visible_note: true,
      admin_private_note: true,
      created_at: true,
      updated_at: true,
      completed_at: true,
    }),
  },
  audit_events: {
    rowType: "AuditEventsRow",
    keys: rowKeys<AuditEventsRow>()({
      id: true,
      actor_profile_id: true,
      action: true,
      entity_type: true,
      entity_id: true,
      metadata: true,
      created_at: true,
      actor_name: true,
      actor_email: true,
    }),
  },
  health_rubrics: {
    rowType: "HealthRubricsRow",
    keys: rowKeys<HealthRubricsRow>()({
      id: true,
      kind: true,
      criteria: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  group_rubric_grades: {
    rowType: "GroupRubricGradesRow",
    keys: rowKeys<GroupRubricGradesRow>()({
      id: true,
      group_id: true,
      ministry_year: true,
      criterion_scores: true,
      override_letter: true,
      override_scope: true,
      override_period_month: true,
      computed_letter: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  leader_rubric_grades: {
    rowType: "LeaderRubricGradesRow",
    keys: rowKeys<LeaderRubricGradesRow>()({
      id: true,
      profile_id: true,
      ministry_year: true,
      criterion_scores: true,
      computed_letter: true,
      override_letter: true,
      override_scope: true,
      override_period_month: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  multiplication_readiness_rule: {
    rowType: "MultiplicationReadinessRuleRow",
    keys: rowKeys<MultiplicationReadinessRuleRow>()({
      id: true,
      ministry_year: true,
      rule: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  shepherd_care_interactions: {
    rowType: "ShepherdCareInteractionsRow",
    keys: rowKeys<ShepherdCareInteractionsRow>()({
      id: true,
      care_profile_id: true,
      interaction_at: true,
      interaction_type: true,
      notes: true,
      created_by_profile_id: true,
      created_at: true,
    }),
  },
  shepherd_care_follow_ups: {
    rowType: "ShepherdCareFollowUpsRow",
    keys: rowKeys<ShepherdCareFollowUpsRow>()({
      id: true,
      care_profile_id: true,
      title: true,
      due_date: true,
      status: true,
      notes: true,
      created_by_profile_id: true,
      created_at: true,
      updated_at: true,
      completed_at: true,
      archived_at: true,
    }),
  },
  care_notes: {
    rowType: "CareNotesRow",
    keys: rowKeys<CareNotesRow>()({
      id: true,
      author_profile_id: true,
      author_descriptor: true,
      subject_profile_id: true,
      subject_group_id: true,
      body: true,
      created_at: true,
      updated_at: true,
    }),
  },
  prayer_requests: {
    rowType: "PrayerRequestsRow",
    keys: rowKeys<PrayerRequestsRow>()({
      id: true,
      author_profile_id: true,
      author_descriptor: true,
      subject_profile_id: true,
      subject_group_id: true,
      body: true,
      status: true,
      created_at: true,
      updated_at: true,
    }),
  },
  shepherd_care_private_notes: {
    rowType: "ShepherdCarePrivateNotesRow",
    keys: rowKeys<ShepherdCarePrivateNotesRow>()({
      id: true,
      care_profile_id: true,
      created_by_profile_id: true,
      ciphertext: true,
      iv: true,
      dek_version: true,
      created_at: true,
      updated_at: true,
    }),
  },
  shepherd_care_note_key_slots: {
    rowType: "ShepherdCareNoteKeySlotsRow",
    keys: rowKeys<ShepherdCareNoteKeySlotsRow>()({
      id: true,
      created_by_profile_id: true,
      dek_version: true,
      slot_type: true,
      credential_id: true,
      label: true,
      prf_salt: true,
      hkdf_salt: true,
      wrapped_dek: true,
      wrap_iv: true,
      created_at: true,
    }),
  },
  over_shepherds: {
    rowType: "OverShepherdsRow",
    keys: rowKeys<OverShepherdsRow>()({
      id: true,
      full_name: true,
      email: true,
      phone: true,
      active: true,
      notes: true,
      created_at: true,
      updated_at: true,
      archived_at: true,
    }),
  },
  shepherd_coverage_assignments: {
    rowType: "ShepherdCoverageAssignmentsRow",
    keys: rowKeys<ShepherdCoverageAssignmentsRow>()({
      id: true,
      shepherd_profile_id: true,
      over_shepherd_id: true,
      active: true,
      assigned_at: true,
      ended_at: true,
      created_at: true,
      updated_at: true,
    }),
  },
  shepherd_care_profiles: {
    rowType: "ShepherdCareProfilesRow",
    keys: rowKeys<ShepherdCareProfilesRow>()({
      id: true,
      shepherd_profile_id: true,
      current_status: true,
      last_contact_at: true,
      next_touchpoint_due: true,
      // Dropped from the table by phase_os5 (20260529004000) but deliberately
      // kept on the Row type as the logical admin-only field — see the
      // ts-only-column allowlist entry below.
      admin_summary: true,
      archived_at: true,
      created_at: true,
      updated_at: true,
    }),
  },
  guests: {
    rowType: "GuestsRow",
    keys: rowKeys<GuestsRow>()({
      id: true,
      full_name: true,
      email: true,
      phone: true,
      first_attended_group_id: true,
      first_attended_date: true,
      pipeline_stage: true,
      assigned_group_id: true,
      follow_up_owner_id: true,
      notes: true,
      created_at: true,
      updated_at: true,
    }),
  },
  group_type_configs: {
    rowType: "GroupTypeConfigsRow",
    keys: rowKeys<GroupTypeConfigsRow>()({
      id: true,
      group_type: true,
      target_count: true,
      readiness_rule: true,
      in_pipeline: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  church_attendance_snapshots: {
    rowType: "ChurchAttendanceSnapshotsRow",
    keys: rowKeys<ChurchAttendanceSnapshotsRow>()({
      id: true,
      snapshot_date: true,
      attendance_count: true,
      note: true,
      created_by_profile_id: true,
      created_at: true,
      updated_at: true,
    }),
  },
  launch_planning_scenarios: {
    rowType: "LaunchPlanningScenariosRow",
    keys: rowKeys<LaunchPlanningScenariosRow>()({
      id: true,
      name: true,
      description: true,
      assumptions: true,
      is_current: true,
      archived_at: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  multiplication_candidates: {
    rowType: "MultiplicationCandidatesRow",
    keys: rowKeys<MultiplicationCandidatesRow>()({
      id: true,
      group_id: true,
      target_year: true,
      status: true,
      shepherd_willing: true,
      needs_similar_stage: true,
      enough_members: true,
      established_long_enough: true,
      co_shepherd_tenured: true,
      notes: true,
      successor_designate: true,
      meeting_time: true,
      leader_pipeline_id: true,
      manual_member_count: true,
      archived_at: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  leader_pipeline: {
    rowType: "LeaderPipelineRow",
    keys: rowKeys<LeaderPipelineRow>()({
      id: true,
      group_id: true,
      display_name: true,
      member_id: true,
      readiness_stage: true,
      expected_ready_on: true,
      notes: true,
      archived_at: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  usage_events: {
    rowType: "UsageEventsRow",
    keys: rowKeys<UsageEventsRow>()({
      id: true,
      actor_profile_id: true,
      event_type: true,
      area: true,
      created_at: true,
    }),
  },
  // ── #885 sweep additions: runtime read tables the first cut missed ────────
  prospects: {
    rowType: "ProspectsRow",
    keys: rowKeys<ProspectsRow>()({
      id: true,
      full_name: true,
      email: true,
      phone: true,
      state: true,
      group_id: true,
      archived: true,
      next_step: true,
      additional_note: true,
      desired_group_type: true,
      created_by: true,
      updated_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  note_transparency_grants: {
    rowType: "NoteTransparencyGrantsRow",
    keys: rowKeys<NoteTransparencyGrantsRow>()({
      id: true,
      subject_profile_id: true,
      granted: true,
      set_by: true,
      created_at: true,
      updated_at: true,
    }),
  },
  shepherd_care_admin_notes: {
    rowType: "ShepherdCareAdminNotesRow",
    keys: rowKeys<ShepherdCareAdminNotesRow>()({
      care_profile_id: true,
      admin_summary: true,
      created_at: true,
      updated_at: true,
    }),
  },
  invitations: {
    rowType: "InvitationsRow",
    keys: rowKeys<InvitationsRow>()({
      id: true,
      token_hash: true,
      role: true,
      group_id: true,
      single_use: true,
      max_uses: true,
      used_count: true,
      expires_at: true,
      revoked_at: true,
      created_by_profile_id: true,
      created_at: true,
    }),
  },
  platform_config: {
    rowType: "PlatformConfigRow",
    keys: rowKeys<PlatformConfigRow>()({
      id: true,
      setting_key: true,
      setting_value: true,
      created_at: true,
      updated_at: true,
    }),
  },
  tombstones: {
    rowType: "TombstonesRow",
    keys: rowKeys<TombstonesRow>()({
      id: true,
      entity_type: true,
      table_name: true,
      entity_id: true,
      row_snapshot: true,
      set_null_dependents: true,
      cleanup_snapshot: true,
      deleted_by: true,
      deleted_at: true,
      restored_at: true,
      restored_by: true,
      restorable: true,
    }),
  },
  profile_auth_purge_jobs: {
    rowType: "ProfileAuthPurgeJobsRow",
    keys: rowKeys<ProfileAuthPurgeJobsRow>()({
      tombstone_id: true,
      profile_id: true,
      auth_user_id: true,
      outcome: true,
      created_at: true,
      completed_at: true,
    }),
  },
  clean_slate_snapshots: {
    rowType: "CleanSlateSnapshotsRow",
    keys: rowKeys<CleanSlateSnapshotsRow>()({
      id: true,
      created_by: true,
      created_at: true,
      kind: true,
      payload: true,
      row_counts: true,
      total_rows: true,
      restored_at: true,
      restored_by: true,
    }),
  },
  history_reset_snapshots: {
    rowType: "HistoryResetSnapshotsRow",
    keys: rowKeys<HistoryResetSnapshotsRow>()({
      id: true,
      created_by: true,
      created_at: true,
      category: true,
      kind: true,
      payload: true,
      row_counts: true,
      total_rows: true,
      restored_at: true,
      restored_by: true,
    }),
  },
  attention_reset_baselines: {
    rowType: "AttentionResetBaselinesRow",
    keys: rowKeys<AttentionResetBaselinesRow>()({
      id: true,
      surface: true,
      scope: true,
      entity_id: true,
      baseline_on: true,
      created_by: true,
      created_at: true,
    }),
  },
  attention_reset_snapshots: {
    rowType: "AttentionResetSnapshotsRow",
    keys: rowKeys<AttentionResetSnapshotsRow>()({
      id: true,
      created_by: true,
      created_at: true,
      surface: true,
      scope: true,
      entity_id: true,
      kind: true,
      payload: true,
      row_counts: true,
      total_rows: true,
      superseded_at: true,
      restored_at: true,
      restored_by: true,
    }),
  },
  activity_reset_baselines: {
    rowType: "ActivityResetBaselinesRow",
    keys: rowKeys<ActivityResetBaselinesRow>()({
      id: true,
      scope: true,
      baseline_on: true,
      created_by: true,
      created_at: true,
    }),
  },
  // Head-only count reads (the Clean Slate impact preview in
  // lib/supabase/maintenance-reads.ts) still traverse RLS against this table,
  // so its Row type is guarded like any other runtime read.
  group_status_history: {
    rowType: "GroupStatusHistoryRow",
    keys: rowKeys<GroupStatusHistoryRow>()({
      id: true,
      group_id: true,
      previous_lifecycle_status: true,
      new_lifecycle_status: true,
      previous_health_status: true,
      new_health_status: true,
      reason: true,
      changed_by: true,
      created_at: true,
    }),
  },
};

// Live `public` base tables DELIBERATELY not guarded, each with its reason.
// The spec asserts completeness (every live base table is guarded or listed
// here) AND staleness (a listed table must still exist and must not also be
// guarded), so this list can only shrink or be consciously extended.
export const UNGUARDED_TABLES: Readonly<Record<string, string>> = {
  audit_events_archive:
    "Reset-audit-logs backup (PRD-SAC6 #290). All access flows through the " +
    "super_admin_* SECURITY DEFINER RPCs — no runtime PostgREST read path, " +
    "so no read allowlist to drift against (AuditEventsArchiveRow mirrors " +
    "AuditEventsRow; guard it if a read surface ever lands).",
  account_deletion_requests:
    "Self-service deletion requests (#563): written via " +
    "request_own_account_deletion and consumed inside the super_admin_* " +
    "purge RPCs — no runtime PostgREST read path.",
  invite_redeem_throttle:
    "Internal rate-limit ledger (IL.2), touched only inside the " +
    "redeem-invite SECURITY DEFINER path — never read by app code.",
  member_care_profiles:
    "Schema landed ahead of the member-care surface (20260624 " +
    "phase_care_member_list_foundation); no Row type in types/database.ts " +
    "and no runtime read path yet — guard it when the surface lands.",
  member_care_interactions:
    "Schema landed ahead of the member-care surface (20260624 " +
    "phase_care_member_list_foundation); no Row type in types/database.ts " +
    "and no runtime read path yet — guard it when the surface lands.",
  first_run_orientations:
    "First-run orientation state (20260705): accessed only via its RPCs — " +
    "no Row type in types/database.ts and no runtime PostgREST read path.",
};

// Live `public` VIEWS the app reads via PostgREST, pinned against their
// hand-rolled row types (which live beside the read seam, not in
// types/database.ts — the whole reason views need their own census, #885).
export const VIEW_ROW_KEYS: Readonly<Record<string, TableManifestEntry>> = {
  group_health_latest_follow_up: {
    rowType: "LatestFollowUpRow (lib/admin/group-health-read.ts)",
    keys: rowKeys<LatestFollowUpRow>()({
      group_id: true,
      needs_follow_up: true,
    }),
  },
};

// Live `public` views DELIBERATELY not guarded (none today). Same contract as
// UNGUARDED_TABLES: the spec asserts every live view is pinned or listed here,
// and that no listed view is stale.
export const UNGUARDED_VIEWS: Readonly<Record<string, string>> = {};

export interface EnumManifestEntry {
  /** The `types/enums.ts` union name, for failure messages. */
  readonly tsType: string;
  /** The pinned value set of that union. */
  readonly values: readonly string[];
}

/** Keyed by the Postgres enum type name (`pg_type.typname`, schema `public`). */
export const DB_ENUM_VALUES: Readonly<Record<string, EnumManifestEntry>> = {
  user_role: {
    tsType: "UserRole",
    values: enumValues<E.UserRole>({
      super_admin: true,
      ministry_admin: true,
      over_shepherd: true,
      leader: true,
      co_leader: true,
    }),
  },
  profile_status: {
    tsType: "ProfileStatus",
    values: enumValues<E.ProfileStatus>({
      active: true,
      inactive: true,
      invited: true,
    }),
  },
  group_lifecycle_status: {
    tsType: "GroupLifecycleStatus",
    values: enumValues<E.GroupLifecycleStatus>({
      active: true,
      planned_pause: true,
      seasonal_break: true,
      launching_soon: true,
      needs_leader: true,
      at_risk: true,
      closed: true,
    }),
  },
  group_health_status: {
    tsType: "GroupHealthStatus",
    values: enumValues<E.GroupHealthStatus>({
      healthy: true,
      watch: true,
      needs_follow_up: true,
      healthy_paused: true,
      restart_soon: true,
      overdue_restart: true,
      capacity_full: true,
      needs_leader_support: true,
    }),
  },
  membership_status: {
    tsType: "MembershipStatus",
    values: enumValues<E.MembershipStatus>({
      active: true,
      inactive: true,
      paused: true,
      transferred: true,
    }),
  },
  role_in_group: {
    tsType: "RoleInGroup",
    values: enumValues<E.RoleInGroup>({
      member: true,
      leader: true,
      co_leader: true,
    }),
  },
  attendance_status: {
    tsType: "AttendanceStatus",
    values: enumValues<E.AttendanceStatus>({
      present: true,
      absent: true,
      excused: true,
    }),
  },
  attendance_session_status: {
    tsType: "AttendanceSessionStatus",
    values: enumValues<E.AttendanceSessionStatus>({
      not_submitted: true,
      submitted: true,
      did_not_meet: true,
      planned_pause: true,
      admin_entered: true,
    }),
  },
  guest_pipeline_stage: {
    tsType: "GuestPipelineStage",
    values: enumValues<E.GuestPipelineStage>({
      new: true,
      contacted: true,
      interested: true,
      assigned: true,
      attended: true,
      placed: true,
      not_now: true,
    }),
  },
  follow_up_type: {
    tsType: "FollowUpType",
    values: enumValues<E.FollowUpType>({
      attendance: true,
      guest: true,
      leader: true,
      capacity: true,
      pause: true,
      care: true,
      admin: true,
    }),
  },
  follow_up_status: {
    tsType: "FollowUpStatus",
    values: enumValues<E.FollowUpStatus>({
      open: true,
      in_progress: true,
      done: true,
      snoozed: true,
    }),
  },
  follow_up_priority: {
    tsType: "FollowUpPriority",
    values: enumValues<E.FollowUpPriority>({
      low: true,
      normal: true,
      high: true,
    }),
  },
  meeting_frequency: {
    tsType: "MeetingFrequency",
    values: enumValues<E.MeetingFrequency>({
      weekly: true,
      biweekly: true,
      monthly: true,
    }),
  },
  meeting_week_parity: {
    tsType: "MeetingWeekParity",
    values: enumValues<E.MeetingWeekParity>({ odd: true, even: true }),
  },
  group_life_stage: {
    tsType: "GroupLifeStage",
    values: enumValues<E.GroupLifeStage>({
      young_professionals: true,
      young_families: true,
      families_with_kids: true,
      families_with_adult_kids: true,
      retirement: true,
      multi_generational: true,
      spanish_speaking: true,
    }),
  },
  multiplication_candidate_status: {
    tsType: "MultiplicationCandidateStatus",
    values: enumValues<E.MultiplicationCandidateStatus>({
      watching: true,
      planned: true,
      launched: true,
      deferred: true,
    }),
  },
  multiplication_meeting_time: {
    tsType: "MultiplicationMeetingTime",
    values: enumValues<E.MultiplicationMeetingTime>({
      during_the_day: true,
      evening: true,
    }),
  },
  leader_readiness_stage: {
    tsType: "LeaderReadinessStage",
    values: enumValues<E.LeaderReadinessStage>({
      identified: true,
      in_training: true,
      ready_to_lead: true,
      launched: true,
    }),
  },
  group_calendar_event_type: {
    tsType: "GroupCalendarEventType",
    values: enumValues<E.GroupCalendarEventType>({
      study: true,
      community_night: true,
      mens_transformation: true,
      womens_transformation: true,
      social: true,
      service: true,
      prayer: true,
      off: true,
      cancelled: true,
      other: true,
    }),
  },
  group_calendar_event_status: {
    tsType: "GroupCalendarEventStatus",
    values: enumValues<E.GroupCalendarEventStatus>({
      scheduled: true,
      off: true,
      cancelled: true,
    }),
  },
  shepherd_care_status: {
    tsType: "ShepherdCareStatus",
    values: enumValues<E.ShepherdCareStatus>({
      doing_well: true,
      needs_encouragement: true,
      needs_follow_up: true,
      concern: true,
      inactive: true,
    }),
  },
  shepherd_care_interaction_type: {
    tsType: "ShepherdCareInteractionType",
    values: enumValues<E.ShepherdCareInteractionType>({
      call: true,
      text: true,
      in_person: true,
      meeting: true,
      other: true,
    }),
  },
  shepherd_care_follow_up_status: {
    tsType: "ShepherdCareFollowUpStatus",
    values: enumValues<E.ShepherdCareFollowUpStatus>({
      open: true,
      in_progress: true,
      done: true,
    }),
  },
  group_health_override_scope: {
    tsType: "GroupHealthOverrideScope",
    values: enumValues<E.GroupHealthOverrideScope>({
      this_month: true,
      until_cleared: true,
    }),
  },
  // Mirrored by the INLINE union on HealthRubricsRow["kind"] rather than a
  // named union in types/enums.ts — pinned all the same so the live enum
  // can't drift unchecked (#885 review finding).
  health_rubric_kind: {
    tsType: 'HealthRubricsRow["kind"]',
    values: enumValues<HealthRubricsRow["kind"]>({
      group: true,
      leader: true,
    }),
  },
  prospect_state: {
    tsType: "ProspectState",
    values: enumValues<E.ProspectState>({
      interested: true,
      matched: true,
      joined: true,
      not_at_this_time: true,
    }),
  },
};

// ─── Deliberate divergences ───────────────────────────────────────────────────
// Each entry documents a KNOWN, decided TS↔SQL divergence with its reason. The
// spec applies these before failing AND asserts each entry is still live (the
// divergence still exists), so a resolved divergence fails the suite with an
// instruction to delete the stale entry — the allowlist can only shrink.

export type DriftAllowlistEntry =
  | {
      /** Column on the Row type that deliberately has no live table column. */
      readonly kind: "ts-only-column";
      readonly table: string;
      readonly column: string;
      readonly reason: string;
    }
  | {
      /** DB enum value deliberately absent from the mirroring TS union. */
      readonly kind: "db-enum-extra-value";
      readonly dbEnum: string;
      readonly value: string;
      readonly reason: string;
    }
  | {
      /** Manifest enum deliberately kept although no live column uses it. */
      readonly kind: "enum-without-column";
      readonly dbEnum: string;
      readonly reason: string;
    }
  | {
      /** DB enum deliberately not mirrored as a named union in types/enums.ts. */
      readonly kind: "db-enum-without-ts-union";
      readonly dbEnum: string;
      readonly reason: string;
    };

export const DRIFT_ALLOWLIST: readonly DriftAllowlistEntry[] = [
  {
    kind: "ts-only-column",
    table: "shepherd_care_profiles",
    column: "admin_summary",
    reason:
      "phase_os5 (20260529004000) dropped the column and moved the value to " +
      "the admin-only shepherd_care_admin_notes table so RLS (not just the " +
      "app allowlist) fences it from the over_shepherd path. It deliberately " +
      "stays on ShepherdCareProfilesRow as the logical admin-only field that " +
      "the admin single-profile read re-attaches.",
  },
  {
    kind: "db-enum-extra-value",
    dbEnum: "user_role",
    value: "staff_viewer",
    reason:
      "#190 (20260531140000) retired the deprecated staff_viewer role but " +
      "made the enum value INERT instead of dropping it: auth_role() returns " +
      "public.user_role, so recreating the type would cascade through every " +
      "predicate. No row holds it and no code path may assign it; the TS " +
      "union deliberately omits it so it cannot re-enter the app.",
  },
  {
    kind: "enum-without-column",
    dbEnum: "group_life_stage",
    reason:
      "phase_groups2 (20260611000000) dropped groups.life_stage but " +
      "deliberately kept the enum TYPE (dropping the column does not require " +
      "dropping its type; keeping it avoids breaking other objects and " +
      "leaves it available for reuse). The GroupLifeStage union stays in " +
      "types/enums.ts to mirror it.",
  },
  {
    kind: "db-enum-without-ts-union",
    dbEnum: "group_audience_category",
    reason:
      "The Audience × Category cell model was retired (20260708000000 " +
      "dropped every column using it) but the enum TYPE was kept, mirroring " +
      "the group_life_stage retention. No named TS union exists for it.",
  },
];
