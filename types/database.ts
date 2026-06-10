import type * as E from "./enums";

type UUID = string;
type Timestamp = string;
type DateString = string;

export interface ProfilesRow {
  id: UUID;
  auth_user_id: UUID | null;
  full_name: string;
  // True while an invited person hasn't chosen their own name yet (ADR 0025);
  // full_name then holds a placeholder (their email) or the pre-invite name.
  full_name_pending: boolean;
  email: string;
  phone: string | null;
  role: E.UserRole;
  status: E.ProfileStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InvitationsRow {
  id: UUID;
  token_hash: string;
  role: E.UserRole;
  group_id: UUID | null;
  single_use: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_by_profile_id: UUID;
  created_at: Timestamp;
}

export interface GroupsRow {
  id: UUID;
  name: string;
  description: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_frequency: E.MeetingFrequency;
  meeting_week_parity: E.MeetingWeekParity | null;
  location_area: string | null;
  address_optional: string | null;
  capacity: number | null;
  lifecycle_status: E.GroupLifecycleStatus;
  health_status: E.GroupHealthStatus;
  audience_category: E.GroupAudienceCategory | null;
  // #398: the catalog category this group carries under its audience_category —
  // the group's cell. null = Uncategorized. Replaces the retired life_stage
  // column as the single segmentation source.
  category_id: string | null;
  launched_on: DateString | null;
  pause_reason: string | null;
  pause_start_date: DateString | null;
  expected_return_date: DateString | null;
  restart_reminder_date: DateString | null;
  admin_notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  closed_at: Timestamp | null;
}

// Group-Health Grade (#127): one assessment per group per month. Rated
// dimensions + override columns are reserved for #128/#129 (nullable now).
export interface GroupHealthAssessmentsRow {
  id: UUID;
  group_id: UUID;
  period_month: DateString;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  spiritual_growth_score: number | null;
  spiritual_growth_note: string | null;
  group_question_score: number | null;
  group_question_leader_reported: boolean;
  computed_numeric: number | null;
  computed_letter: E.GroupHealthLetter | null;
  override_letter: E.GroupHealthLetter | null;
  override_scope: E.GroupHealthOverrideScope | null;
  override_reason: string | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  // #126 gh3: deliberate follow-up flag for the assessment, set when the group's
  // health warrants a next-step (parallels group_health_updates.follow_up_needed).
  needs_follow_up: boolean;
}

export interface GroupLeadersRow {
  id: UUID;
  group_id: UUID;
  profile_id: UUID;
  role: E.RoleInGroup;
  assigned_at: DateString;
  active: boolean;
  created_at: Timestamp;
}

export interface MembersRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  household_name: string | null;
  status: E.MembershipStatus;
  care_sensitivity_flag: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupMembershipsRow {
  id: UUID;
  group_id: UUID;
  member_id: UUID;
  role: E.RoleInGroup;
  status: E.MembershipStatus;
  joined_at: DateString;
  ended_at: DateString | null;
  created_at: Timestamp;
}

export interface AttendanceSessionsRow {
  id: UUID;
  group_id: UUID;
  meeting_week: DateString;
  meeting_date: DateString | null;
  status: E.AttendanceSessionStatus;
  submitted_by: UUID | null;
  submitted_at: Timestamp | null;
  leader_note: string | null;
  admin_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AttendanceRecordsRow {
  id: UUID;
  session_id: UUID;
  member_id: UUID;
  attendance_status: E.AttendanceStatus;
  created_at: Timestamp;
}

export interface GuestsRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  first_attended_group_id: UUID | null;
  first_attended_date: DateString | null;
  pipeline_stage: E.GuestPipelineStage;
  assigned_group_id: UUID | null;
  follow_up_owner_id: UUID | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FollowUpsRow {
  id: UUID;
  type: E.FollowUpType;
  title: string;
  related_group_id: UUID | null;
  related_member_id: UUID | null;
  related_guest_id: UUID | null;
  assigned_to: UUID | null;
  priority: E.FollowUpPriority;
  due_date: DateString | null;
  status: E.FollowUpStatus;
  leader_visible_note: string | null;
  admin_private_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
}

export interface GroupHealthUpdatesRow {
  id: UUID;
  group_id: UUID;
  submitted_by: UUID | null;
  update_week: DateString;
  pulse: E.GroupHealthStatus;
  follow_up_needed: boolean;
  leader_note: string | null;
  admin_note: string | null;
  created_at: Timestamp;
}

export interface AuditEventsRow {
  id: UUID;
  actor_profile_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
  // ADR 0014 (#314): denormalized actor descriptor, written at insert +
  // backfilled, so attribution survives the actor's permanent deletion (when
  // actor_profile_id nulls). The UI falls back to these when the FK is null.
  actor_name: string | null;
  actor_email: string | null;
}

export interface AppSettingsRow {
  id: UUID;
  setting_key: string;
  setting_value: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// PRD-SAC6 (#290): backup of purged audit rows. Mirrors AuditEventsRow plus the
// time the row was archived. Super-admin-only SELECT RLS; all writes flow
// through the super_admin_reset_audit_logs SECURITY DEFINER RPC.
export interface AuditEventsArchiveRow {
  id: UUID;
  actor_profile_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
  archived_at: Timestamp;
  // ADR 0014 (#314): the descriptor mirror, so resetting logs then deleting the
  // actor doesn't lose attribution in the archive.
  actor_name: string | null;
  actor_email: string | null;
}

// PRD-SAC6 (#288): single in-DB snapshot store for the Clean Slate history
// wipe. Super-admin-only SELECT RLS; all writes flow through the
// super_admin_clean_slate_wipe SECURITY DEFINER RPC.
export interface CleanSlateSnapshotsRow {
  id: UUID;
  created_by: UUID | null;
  created_at: Timestamp;
  kind: string;
  payload: Record<string, unknown>;
  row_counts: Record<string, number>;
  total_rows: number;
  restored_at: Timestamp | null;
  restored_by: UUID | null;
}

// PRD-SAC6 follow-up: per-category history reset snapshot store. Super-admin-only
// SELECT RLS; all writes flow through the super_admin_reset_history_category /
// _revert SECURITY DEFINER RPCs. `category` records which history category the
// snapshot captured; the store keeps at most one un-restored snapshot per category.
export interface HistoryResetSnapshotsRow {
  id: UUID;
  created_by: UUID | null;
  created_at: Timestamp;
  category: string;
  kind: string;
  payload: Record<string, unknown>;
  row_counts: Record<string, number>;
  total_rows: number;
  restored_at: Timestamp | null;
  restored_by: UUID | null;
}

// health-checks-reset: the "as-of" reset baselines the duration-derived "Needs
// attention" cards measure from. Either a single global row per surface
// (scope='global', entity_id null) or a per-entity override (scope='entity',
// entity_id = shepherd profile id for care / group id for health). Admin-readable
// SELECT RLS (the dashboard honours it); all writes flow through the
// super_admin_reset_* SECURITY DEFINER RPCs.
export interface AttentionResetBaselinesRow {
  id: UUID;
  surface: "care" | "health";
  scope: "global" | "entity";
  entity_id: UUID | null;
  baseline_on: DateString;
  created_by: UUID | null;
  created_at: Timestamp;
}

// activity-reset: the single global "as-of" baseline the Home Recent-activity
// tiles measure from. Admin-readable SELECT RLS (the dashboard honours it); all
// writes flow through the super_admin_reset_activity /
// super_admin_clear_activity_reset SECURITY DEFINER RPCs.
export interface ActivityResetBaselinesRow {
  id: UUID;
  scope: "global";
  baseline_on: DateString;
  created_by: UUID | null;
  created_at: Timestamp;
}

// health-checks-reset: recoverable snapshot store for the attention resets, kept
// independent of clean_slate_snapshots / history_reset_snapshots so a Clean Slate
// wipe never blows it away. payload holds the prior baseline rows and (for care)
// the prior shepherd_care_profiles field values the reset overwrote.
export interface AttentionResetSnapshotsRow {
  id: UUID;
  created_by: UUID | null;
  created_at: Timestamp;
  surface: "care" | "health";
  scope: "global" | "entity";
  entity_id: UUID | null;
  kind: string;
  payload: Record<string, unknown>;
  row_counts: Record<string, number>;
  total_rows: number;
  // Set when a newer reset for the same surface/scope/entity replaces this one
  // (retained for audit/recovery, not surfaced as the active recoverable row).
  superseded_at: Timestamp | null;
  restored_at: Timestamp | null;
  restored_by: UUID | null;
}

// ADR 0014 (#312): permanent-deletion tombstone. Super-admin-only SELECT RLS;
// never itself a delete target. Writes only via the super_admin_* SECURITY
// DEFINER RPCs. row_snapshot is the full deleted row; set_null_dependents is the
// array of {table, column, ids} the delete nulled, so restore (#315) can re-link.
export interface TombstonesRow {
  id: UUID;
  entity_type: string;
  table_name: string;
  entity_id: UUID;
  row_snapshot: Record<string, unknown>;
  set_null_dependents: Array<{
    table: string;
    column: string;
    ids: UUID[];
    count?: number;
  }>;
  deleted_by: UUID | null;
  deleted_at: Timestamp;
  restored_at: Timestamp | null;
  restored_by: UUID | null;
}

// Phase SAC.1 (#159): Super-Admin-only platform config (feature flags + editable
// copy). Mirrors the AppSettingsRow keyed-row shape but lives in its own table
// with Super-Admin-only RLS, so the Ministry Admin can never read it.
export interface PlatformConfigRow {
  id: UUID;
  setting_key: string;
  setting_value: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Phase USAGE.1: coarse usage telemetry. `event_type` is "login" | "area_view"
// (validated by log_usage_event); `area` is a bounded lowercase slug for an
// area_view and null for a login. Super-Admin-only SELECT; written only via the
// log_usage_event RPC, and only while the usage_tracking flag is on.
export interface UsageEventsRow {
  id: UUID;
  actor_profile_id: UUID | null;
  event_type: string;
  area: string | null;
  created_at: Timestamp;
}

export interface GroupMetricSettingsRow {
  group_id: UUID;
  capacity_override: number | null;
  capacity_warning_threshold_pct_override: number | null;
  healthy_attendance_pct_override: number | null;
  manual_health_status_override: E.GroupHealthStatus | null;
  exclude_from_capacity_metrics: boolean;
  admin_metric_notes: string | null;
  check_in_due_offset_hours_override: number | null;
  allow_over_capacity: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ChurchAttendanceSnapshotsRow {
  id: UUID;
  snapshot_date: DateString;
  attendance_count: number;
  note: string | null;
  created_by_profile_id: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MultiplicationCandidatesRow {
  id: UUID;
  // Type-first: a candidate is anchored to a cell (audience_category ×
  // category_id); the multiplying group is optional, set only once a leader is
  // willing and a specific group of that type is picked. null = type-only watch.
  group_id: UUID | null;
  audience_category: E.GroupAudienceCategory | null;
  category_id: UUID | null;
  target_year: number | null;
  status: E.MultiplicationCandidateStatus;
  shepherd_willing: boolean;
  needs_similar_stage: boolean;
  notes: string | null;
  successor_designate: string | null;
  meeting_time: E.MultiplicationMeetingTime | null;
  // Capacity & Multiplication #184: same-group apprentice raised to lead the
  // multiplied group. Source of truth for "who leads it"; successor_designate
  // is retained through the migration.
  leader_pipeline_id: UUID | null;
  // ADR 0022: Julian-fed headcount for this group, taking precedence over the
  // in-app roster count for the planner's display and the "12+ members"
  // readiness criterion. Null = fall back to the computed roster count.
  manual_member_count: number | null;
  archived_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LeaderPipelineRow {
  id: UUID;
  group_id: UUID;
  display_name: string;
  member_id: UUID | null;
  readiness_stage: E.LeaderReadinessStage;
  expected_ready_on: DateString | null;
  notes: string | null;
  archived_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupCalendarEventsRow {
  id: UUID;
  group_id: UUID;
  event_date: DateString;
  start_time: string | null;
  end_time: string | null;
  event_type: E.GroupCalendarEventType;
  status: E.GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface ShepherdCareProfilesRow {
  id: UUID;
  shepherd_profile_id: UUID;
  current_status: E.ShepherdCareStatus;
  last_contact_at: DateString | null;
  next_touchpoint_due: DateString | null;
  // NOTE: admin_summary is no longer a column on shepherd_care_profiles —
  // phase_os5 moved it to the admin-only shepherd_care_admin_notes table so RLS
  // (not just the app allowlist) fences it from the over_shepherd path. The
  // admin single-profile read (fetchShepherdCareProfileByShepherdId) re-attaches
  // it onto this row from that table. It stays on the type as the logical
  // admin-only field; no over_shepherd read ever selects or populates it.
  admin_summary: string | null;
  archived_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ShepherdCareAdminNotesRow {
  care_profile_id: UUID;
  admin_summary: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ShepherdCareInteractionsRow {
  id: UUID;
  care_profile_id: UUID;
  interaction_at: DateString;
  interaction_type: E.ShepherdCareInteractionType;
  notes: string | null;
  created_by_profile_id: UUID;
  created_at: Timestamp;
}

// Phase SC.1B — admin-only care follow-up tasks. Separate from FollowUpsRow
// (the generic public.follow_ups table); the two never cross-read. Reachable
// only through admin-gated reads/RPCs — never leaders or over-shepherds.
export interface ShepherdCareFollowUpsRow {
  id: UUID;
  care_profile_id: UUID;
  title: string;
  due_date: DateString | null;
  status: E.ShepherdCareFollowUpStatus;
  notes: string | null;
  created_by_profile_id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
  // Soft-archive timestamp (#admin-ux). Set when an admin archives the
  // follow-up so accidental/test rows drop out of every queue; null = active.
  // No hard delete — the row stays for the audit trail.
  archived_at: Timestamp | null;
}

// Phase SC.4 — zero-knowledge private care notes. The body is AES-256-GCM
// ciphertext encrypted client-side; the server never holds plaintext or the
// key. Creator-scoped RLS (excludes super_admin). bytea columns come back from
// PostgREST as hex strings and are normalised to base64 by the read model, so
// they are typed `string` here. Writes only via the SECURITY DEFINER RPCs.
export interface ShepherdCarePrivateNotesRow {
  id: UUID;
  care_profile_id: UUID;
  created_by_profile_id: UUID;
  ciphertext: string; // bytea
  iv: string; // bytea
  dek_version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ShepherdCareNoteKeySlotsRow {
  id: UUID;
  created_by_profile_id: UUID;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null; // bytea
  label: string | null;
  prf_salt: string | null; // bytea
  hkdf_salt: string; // bytea
  wrapped_dek: string; // bytea
  wrap_iv: string; // bytea
  created_at: Timestamp;
}

// Pivot slice 9 (#381 / ADR 0017) — author-private Care Notes + Prayer Requests
// with the per-person transparency model. DISTINCT from the SC.4 encrypted
// private care note above: plaintext bodies, subject-toggle-gated ladder peek.
// note_transparency_grants is the per-subject Ministry-Admin peek toggle (default
// DENIED). All three are admin/author-RLS-fenced; writes only via the RPCs.
export interface NoteTransparencyGrantsRow {
  id: UUID;
  subject_profile_id: UUID;
  granted: boolean;
  set_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Pivot slice 11 (#382 / ADR 0020): the subject is EITHER a leader profile (an
// Over-Shepherd note about a leader) OR a group (a leader note about their
// group). Exactly one of subject_profile_id / subject_group_id is set, enforced
// by the care_notes_one_subject / prayer_requests_one_subject DB checks.
export interface CareNotesRow {
  id: UUID;
  author_profile_id: UUID;
  subject_profile_id: UUID | null;
  subject_group_id: UUID | null;
  body: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PrayerRequestsRow {
  id: UUID;
  author_profile_id: UUID;
  subject_profile_id: UUID | null;
  subject_group_id: UUID | null;
  body: string;
  status: "open" | "answered" | "archived";
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OverShepherdsRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface ShepherdCoverageAssignmentsRow {
  id: UUID;
  shepherd_profile_id: UUID;
  over_shepherd_id: UUID;
  active: boolean;
  assigned_at: DateString;
  ended_at: DateString | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LaunchPlanningScenariosRow {
  id: UUID;
  name: string;
  description: string | null;
  assumptions: Record<string, unknown>;
  is_current: boolean;
  archived_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ── Health Rubric + rubric grades (#374, #377, #378 / ADR 0018) ──────────────
// The configurable per-kind rubric Julian owns in Settings, plus the group- and
// leader-level letter grades scored against it. Admin-only; read column-
// allowlisted via lib/supabase/*-reads with .returns<>(); writes via the
// admin_set_health_rubric / admin_set_group_rubric_grade /
// admin_set_leader_rubric_grade RPCs. Letter/scope columns are stored as text in
// Postgres but carry the A–F / scope vocabularies, typed here as the matching
// enums to mirror their meaning (consistent with GroupHealthAssessmentsRow).
export interface HealthRubricsRow {
  id: UUID;
  kind: "group" | "leader";
  criteria: Record<string, unknown>;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupRubricGradesRow {
  id: UUID;
  group_id: UUID;
  ministry_year: number;
  criterion_scores: Record<string, unknown>;
  override_letter: E.GroupHealthLetter | null;
  override_scope: E.GroupHealthOverrideScope | null;
  override_period_month: DateString | null;
  computed_letter: E.GroupHealthLetter | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LeaderRubricGradesRow {
  id: UUID;
  profile_id: UUID;
  ministry_year: number;
  criterion_scores: Record<string, unknown>;
  computed_letter: E.LeaderHealthLetter | null;
  override_letter: E.LeaderHealthLetter | null;
  override_scope: E.GroupHealthOverrideScope | null;
  override_period_month: DateString | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ── Interest Funnel Prospects (#375 / ADR 0016) ──────────────────────────────
// Supersedes the frozen guests pipeline. Admin-only; read column-allowlisted
// with .returns<>() (next_step arrives as raw jsonb, decoded at the trust
// boundary). Writes via admin_create_prospect / admin_transition_prospect /
// admin_update_prospect / admin_archive_prospect.
export interface ProspectsRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: E.ProspectState;
  group_id: UUID | null;
  archived: boolean;
  next_step: Record<string, unknown> | null;
  additional_note: string | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  // #399: the DESIRED (audience_category × catalog category) cell named at
  // intake. Both null when no cell was chosen; the per-cell tally keys on them.
  desired_audience_category: E.GroupAudienceCategory | null;
  desired_category_id: UUID | null;
}

// ── Groups overhaul: category catalog + per-cell config (#396, #402, #410) ────
// group_categories is the free-form label catalog; category_type_targets is one
// row per active (audience_category × category) cell. Readiness cascades
// global (multiplication_readiness_rule) → per-type (audience_readiness_rule) →
// per-cell (category_type_targets.trigger_overrides). All admin-only; writes via
// admin_create/rename/archive_group_category, admin_set_category_type_cell,
// admin_set_category_type_target_count, admin_set_readiness_rule,
// admin_set_audience_readiness_rule. audience_category is stored as text but
// carries the GroupAudienceCategory vocabulary (mirrors GroupsRow).
export interface GroupCategoriesRow {
  id: UUID;
  label: string;
  archived_at: Timestamp | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CategoryTypeTargetsRow {
  id: UUID;
  audience_category: E.GroupAudienceCategory;
  category_id: UUID;
  active: boolean;
  target_count: number;
  trigger_overrides: Record<string, unknown>;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MultiplicationReadinessRuleRow {
  id: UUID;
  ministry_year: number;
  rule: Record<string, unknown>;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AudienceReadinessRuleRow {
  id: UUID;
  ministry_year: number;
  audience_category: E.GroupAudienceCategory;
  rule: Record<string, unknown>;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ── Multiplication Pillars config (#380 / ADR 0016; fed capacity retired #401) ─
// Per-type, per-ministry-year pillar thresholds + trigger rubric. group_type is
// stored as text but carries the GroupAudienceCategory vocabulary. Admin-only;
// writes via admin_set_multiplication_config.
export interface MultiplicationConfigRow {
  id: UUID;
  group_type: E.GroupAudienceCategory;
  ministry_year: number;
  thresholds: Record<string, unknown>;
  trigger_rubric: Record<string, unknown>;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ── Group lifecycle/health status history (append-only audit trail) ──────────
export interface GroupStatusHistoryRow {
  id: UUID;
  group_id: UUID;
  previous_lifecycle_status: E.GroupLifecycleStatus | null;
  new_lifecycle_status: E.GroupLifecycleStatus;
  previous_health_status: E.GroupHealthStatus | null;
  new_health_status: E.GroupHealthStatus;
  reason: string | null;
  changed_by: UUID | null;
  created_at: Timestamp;
}

// ── Invite redeem throttle (IL.2): internal rate-limit ledger, never surfaced ─
export interface InviteRedeemThrottleRow {
  id: UUID;
  throttle_key: string;
  attempted_at: Timestamp;
}

type InsertOf<
  Row,
  Auto extends keyof Row,
  Optional extends keyof Row = never,
> = Omit<Row, Auto | Optional> & Partial<Pick<Row, Auto | Optional>>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: InsertOf<ProfilesRow, "id" | "created_at" | "updated_at">;
        Update: Partial<ProfilesRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupsRow;
        Insert: InsertOf<
          GroupsRow,
          "id" | "created_at" | "updated_at" | "closed_at"
        >;
        Update: Partial<GroupsRow>;
        Relationships: [];
      };
      group_leaders: {
        Row: GroupLeadersRow;
        Insert: InsertOf<
          GroupLeadersRow,
          "id" | "created_at" | "assigned_at" | "active"
        >;
        Update: Partial<GroupLeadersRow>;
        Relationships: [];
      };
      members: {
        Row: MembersRow;
        Insert: InsertOf<MembersRow, "id" | "created_at" | "updated_at">;
        Update: Partial<MembersRow>;
        Relationships: [];
      };
      group_memberships: {
        Row: GroupMembershipsRow;
        Insert: InsertOf<
          GroupMembershipsRow,
          "id" | "created_at" | "joined_at" | "ended_at"
        >;
        Update: Partial<GroupMembershipsRow>;
        Relationships: [];
      };
      attendance_sessions: {
        Row: AttendanceSessionsRow;
        Insert: InsertOf<
          AttendanceSessionsRow,
          "id" | "created_at" | "updated_at" | "submitted_by" | "submitted_at"
        >;
        Update: Partial<AttendanceSessionsRow>;
        Relationships: [];
      };
      attendance_records: {
        Row: AttendanceRecordsRow;
        Insert: InsertOf<AttendanceRecordsRow, "id" | "created_at">;
        Update: Partial<AttendanceRecordsRow>;
        Relationships: [];
      };
      guests: {
        Row: GuestsRow;
        Insert: InsertOf<GuestsRow, "id" | "created_at" | "updated_at">;
        Update: Partial<GuestsRow>;
        Relationships: [];
      };
      follow_ups: {
        Row: FollowUpsRow;
        Insert: InsertOf<
          FollowUpsRow,
          "id" | "created_at" | "updated_at" | "completed_at"
        >;
        Update: Partial<FollowUpsRow>;
        Relationships: [];
      };
      group_health_updates: {
        Row: GroupHealthUpdatesRow;
        Insert: InsertOf<GroupHealthUpdatesRow, "id" | "created_at">;
        Update: Partial<GroupHealthUpdatesRow>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEventsRow;
        Insert: InsertOf<
          AuditEventsRow,
          "id" | "created_at" | "metadata" | "actor_name" | "actor_email"
        >;
        Update: Partial<AuditEventsRow>;
        Relationships: [];
      };
      usage_events: {
        Row: UsageEventsRow;
        Insert: InsertOf<UsageEventsRow, "id" | "created_at" | "area">;
        Update: Partial<UsageEventsRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingsRow;
        Insert: InsertOf<AppSettingsRow, "id" | "created_at" | "updated_at">;
        Update: Partial<AppSettingsRow>;
        Relationships: [];
      };
      invitations: {
        Row: InvitationsRow;
        Insert: InsertOf<
          InvitationsRow,
          | "id"
          | "created_at"
          | "single_use"
          | "max_uses"
          | "used_count"
          | "revoked_at"
        >;
        Update: Partial<InvitationsRow>;
        Relationships: [];
      };
      audit_events_archive: {
        Row: AuditEventsArchiveRow;
        Insert: InsertOf<
          AuditEventsArchiveRow,
          "metadata" | "archived_at" | "actor_name" | "actor_email"
        >;
        Update: Partial<AuditEventsArchiveRow>;
        Relationships: [];
      };
      clean_slate_snapshots: {
        Row: CleanSlateSnapshotsRow;
        Insert: InsertOf<
          CleanSlateSnapshotsRow,
          | "id"
          | "created_at"
          | "row_counts"
          | "total_rows"
          | "restored_at"
          | "restored_by"
        >;
        Update: Partial<CleanSlateSnapshotsRow>;
        Relationships: [];
      };
      history_reset_snapshots: {
        Row: HistoryResetSnapshotsRow;
        Insert: InsertOf<
          HistoryResetSnapshotsRow,
          | "id"
          | "created_at"
          | "row_counts"
          | "total_rows"
          | "restored_at"
          | "restored_by"
        >;
        Update: Partial<HistoryResetSnapshotsRow>;
        Relationships: [];
      };
      activity_reset_baselines: {
        Row: ActivityResetBaselinesRow;
        Insert: InsertOf<ActivityResetBaselinesRow, "id" | "created_at">;
        Update: Partial<ActivityResetBaselinesRow>;
        Relationships: [];
      };
      attention_reset_baselines: {
        Row: AttentionResetBaselinesRow;
        Insert: InsertOf<AttentionResetBaselinesRow, "id" | "created_at">;
        Update: Partial<AttentionResetBaselinesRow>;
        Relationships: [];
      };
      attention_reset_snapshots: {
        Row: AttentionResetSnapshotsRow;
        Insert: InsertOf<
          AttentionResetSnapshotsRow,
          | "id"
          | "created_at"
          | "row_counts"
          | "total_rows"
          | "superseded_at"
          | "restored_at"
          | "restored_by"
        >;
        Update: Partial<AttentionResetSnapshotsRow>;
        Relationships: [];
      };
      tombstones: {
        Row: TombstonesRow;
        Insert: InsertOf<
          TombstonesRow,
          | "id"
          | "set_null_dependents"
          | "deleted_by"
          | "deleted_at"
          | "restored_at"
          | "restored_by"
        >;
        Update: Partial<TombstonesRow>;
        Relationships: [];
      };
      platform_config: {
        Row: PlatformConfigRow;
        Insert: InsertOf<PlatformConfigRow, "id" | "created_at" | "updated_at">;
        Update: Partial<PlatformConfigRow>;
        Relationships: [];
      };
      group_metric_settings: {
        Row: GroupMetricSettingsRow;
        Insert: InsertOf<GroupMetricSettingsRow, "created_at" | "updated_at">;
        Update: Partial<GroupMetricSettingsRow>;
        Relationships: [];
      };
      church_attendance_snapshots: {
        Row: ChurchAttendanceSnapshotsRow;
        Insert: InsertOf<
          ChurchAttendanceSnapshotsRow,
          "id" | "created_at" | "updated_at" | "created_by_profile_id" | "note"
        >;
        Update: Partial<ChurchAttendanceSnapshotsRow>;
        Relationships: [];
      };
      multiplication_candidates: {
        Row: MultiplicationCandidatesRow;
        Insert: InsertOf<
          MultiplicationCandidatesRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "archived_at"
          | "created_by"
          | "updated_by"
          | "notes"
          | "successor_designate"
          | "meeting_time"
          | "leader_pipeline_id"
          | "manual_member_count"
        >;
        Update: Partial<MultiplicationCandidatesRow>;
        Relationships: [];
      };
      leader_pipeline: {
        Row: LeaderPipelineRow;
        Insert: InsertOf<
          LeaderPipelineRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "archived_at"
          | "created_by"
          | "updated_by"
          | "member_id"
          | "readiness_stage"
          | "expected_ready_on"
          | "notes"
        >;
        Update: Partial<LeaderPipelineRow>;
        Relationships: [];
      };
      group_calendar_events: {
        Row: GroupCalendarEventsRow;
        Insert: InsertOf<
          GroupCalendarEventsRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "archived_at"
          | "created_by"
          | "updated_by"
        >;
        Update: Partial<GroupCalendarEventsRow>;
        Relationships: [];
      };
      shepherd_care_profiles: {
        Row: ShepherdCareProfilesRow;
        Insert: InsertOf<
          ShepherdCareProfilesRow,
          "id" | "created_at" | "updated_at" | "archived_at" | "current_status"
        >;
        Update: Partial<ShepherdCareProfilesRow>;
        Relationships: [];
      };
      shepherd_care_interactions: {
        Row: ShepherdCareInteractionsRow;
        Insert: InsertOf<ShepherdCareInteractionsRow, "id" | "created_at">;
        Update: Partial<ShepherdCareInteractionsRow>;
        Relationships: [];
      };
      shepherd_care_follow_ups: {
        Row: ShepherdCareFollowUpsRow;
        Insert: InsertOf<
          ShepherdCareFollowUpsRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "completed_at"
          | "status"
          | "archived_at"
        >;
        Update: Partial<ShepherdCareFollowUpsRow>;
        Relationships: [];
      };
      shepherd_care_private_notes: {
        Row: ShepherdCarePrivateNotesRow;
        Insert: InsertOf<
          ShepherdCarePrivateNotesRow,
          "id" | "created_at" | "updated_at" | "dek_version"
        >;
        Update: Partial<ShepherdCarePrivateNotesRow>;
        Relationships: [];
      };
      shepherd_care_note_key_slots: {
        Row: ShepherdCareNoteKeySlotsRow;
        Insert: InsertOf<
          ShepherdCareNoteKeySlotsRow,
          "id" | "created_at" | "dek_version"
        >;
        Update: Partial<ShepherdCareNoteKeySlotsRow>;
        Relationships: [];
      };
      note_transparency_grants: {
        Row: NoteTransparencyGrantsRow;
        Insert: InsertOf<
          NoteTransparencyGrantsRow,
          "id" | "created_at" | "updated_at" | "granted" | "set_by"
        >;
        Update: Partial<NoteTransparencyGrantsRow>;
        Relationships: [];
      };
      care_notes: {
        Row: CareNotesRow;
        Insert: InsertOf<CareNotesRow, "id" | "created_at" | "updated_at">;
        Update: Partial<CareNotesRow>;
        Relationships: [];
      };
      prayer_requests: {
        Row: PrayerRequestsRow;
        Insert: InsertOf<
          PrayerRequestsRow,
          "id" | "created_at" | "updated_at" | "status"
        >;
        Update: Partial<PrayerRequestsRow>;
        Relationships: [];
      };
      over_shepherds: {
        Row: OverShepherdsRow;
        Insert: InsertOf<
          OverShepherdsRow,
          "id" | "created_at" | "updated_at" | "archived_at" | "active"
        >;
        Update: Partial<OverShepherdsRow>;
        Relationships: [];
      };
      shepherd_coverage_assignments: {
        Row: ShepherdCoverageAssignmentsRow;
        Insert: InsertOf<
          ShepherdCoverageAssignmentsRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "ended_at"
          | "active"
          | "assigned_at"
        >;
        Update: Partial<ShepherdCoverageAssignmentsRow>;
        Relationships: [];
      };
      launch_planning_scenarios: {
        Row: LaunchPlanningScenariosRow;
        Insert: InsertOf<
          LaunchPlanningScenariosRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "archived_at"
          | "is_current"
          | "created_by"
          | "updated_by"
          | "description"
        >;
        Update: Partial<LaunchPlanningScenariosRow>;
        Relationships: [];
      };
      group_health_assessments: {
        Row: GroupHealthAssessmentsRow;
        Insert: InsertOf<
          GroupHealthAssessmentsRow,
          | "id"
          | "attendance_weeks_counted"
          | "group_question_leader_reported"
          | "needs_follow_up"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<GroupHealthAssessmentsRow>;
        Relationships: [];
      };
      health_rubrics: {
        Row: HealthRubricsRow;
        Insert: InsertOf<HealthRubricsRow, "id" | "created_at" | "updated_at">;
        Update: Partial<HealthRubricsRow>;
        Relationships: [];
      };
      group_rubric_grades: {
        Row: GroupRubricGradesRow;
        Insert: InsertOf<
          GroupRubricGradesRow,
          "id" | "criterion_scores" | "created_at" | "updated_at"
        >;
        Update: Partial<GroupRubricGradesRow>;
        Relationships: [];
      };
      leader_rubric_grades: {
        Row: LeaderRubricGradesRow;
        Insert: InsertOf<
          LeaderRubricGradesRow,
          "id" | "criterion_scores" | "created_at" | "updated_at"
        >;
        Update: Partial<LeaderRubricGradesRow>;
        Relationships: [];
      };
      prospects: {
        Row: ProspectsRow;
        Insert: InsertOf<
          ProspectsRow,
          "id" | "state" | "archived" | "created_at" | "updated_at"
        >;
        Update: Partial<ProspectsRow>;
        Relationships: [];
      };
      group_categories: {
        Row: GroupCategoriesRow;
        Insert: InsertOf<
          GroupCategoriesRow,
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<GroupCategoriesRow>;
        Relationships: [];
      };
      category_type_targets: {
        Row: CategoryTypeTargetsRow;
        Insert: InsertOf<
          CategoryTypeTargetsRow,
          | "id"
          | "active"
          | "target_count"
          | "trigger_overrides"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<CategoryTypeTargetsRow>;
        Relationships: [];
      };
      multiplication_readiness_rule: {
        Row: MultiplicationReadinessRuleRow;
        Insert: InsertOf<
          MultiplicationReadinessRuleRow,
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<MultiplicationReadinessRuleRow>;
        Relationships: [];
      };
      audience_readiness_rule: {
        Row: AudienceReadinessRuleRow;
        Insert: InsertOf<
          AudienceReadinessRuleRow,
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<AudienceReadinessRuleRow>;
        Relationships: [];
      };
      multiplication_config: {
        Row: MultiplicationConfigRow;
        Insert: InsertOf<
          MultiplicationConfigRow,
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<MultiplicationConfigRow>;
        Relationships: [];
      };
      group_status_history: {
        Row: GroupStatusHistoryRow;
        Insert: InsertOf<GroupStatusHistoryRow, "id" | "created_at">;
        Update: Partial<GroupStatusHistoryRow>;
        Relationships: [];
      };
      invite_redeem_throttle: {
        Row: InviteRedeemThrottleRow;
        Insert: InsertOf<InviteRedeemThrottleRow, "id" | "attempted_at">;
        Update: Partial<InviteRedeemThrottleRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_create_leader_profile: {
        Args: { p_full_name: string; p_email: string; p_phone: string | null };
        Returns: UUID;
      };
      admin_create_member: {
        Args: {
          p_full_name: string;
          p_email: string | null;
          p_phone: string | null;
        };
        Returns: UUID;
      };
      admin_assign_leader_to_group: {
        Args: { p_group_id: UUID; p_profile_id: UUID; p_role: E.RoleInGroup };
        Returns: UUID;
      };
      admin_assign_member_to_group: {
        Args: { p_group_id: UUID; p_member_id: UUID };
        Returns: UUID;
      };
      admin_deactivate_profile: {
        Args: { p_profile_id: UUID };
        Returns: UUID;
      };
      admin_deactivate_member: {
        Args: { p_member_id: UUID };
        Returns: UUID;
      };
      admin_unassign_leader_from_group: {
        Args: { p_group_id: UUID; p_profile_id: UUID };
        Returns: UUID;
      };
      admin_end_group_membership: {
        Args: { p_group_id: UUID; p_member_id: UUID };
        Returns: UUID;
      };
      admin_create_group: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_meeting_day: string | null;
          p_meeting_time: string | null;
          p_location_area: string | null;
          p_address_optional: string | null;
          p_capacity: number | null;
          p_meeting_frequency: E.MeetingFrequency;
          p_meeting_week_parity: E.MeetingWeekParity | null;
        };
        Returns: UUID;
      };
      admin_update_group: {
        Args: {
          p_group_id: UUID;
          p_name: string;
          p_description: string | null;
          p_meeting_day: string | null;
          p_meeting_time: string | null;
          p_location_area: string | null;
          p_address_optional: string | null;
          p_capacity: number | null;
          p_meeting_frequency: E.MeetingFrequency;
          p_meeting_week_parity: E.MeetingWeekParity | null;
        };
        Returns: UUID;
      };
      admin_close_group: {
        Args: { p_group_id: UUID };
        Returns: UUID;
      };
      admin_reopen_group: {
        Args: { p_group_id: UUID };
        Returns: UUID;
      };
      leader_submit_group_checkin: {
        Args: {
          p_group_id: UUID;
          p_meeting_week: DateString;
          p_meeting_date: DateString | null;
          p_status: "submitted" | "did_not_meet" | "planned_pause";
          p_leader_note: string | null;
          p_pulse: "healthy" | "watch" | "needs_follow_up" | null;
          p_follow_up_needed: boolean;
          p_attendance: {
            member_id: UUID;
            attendance_status: E.AttendanceStatus;
          }[];
        };
        Returns: UUID;
      };
      admin_update_metric_defaults: {
        Args: { p_settings: Record<string, unknown> };
        Returns: UUID;
      };
      admin_reset_metric_defaults: {
        Args: Record<string, never>;
        Returns: UUID;
      };
      super_admin_set_platform_config: {
        Args: { p_config: Record<string, unknown> };
        Returns: UUID;
      };
      log_usage_event: {
        Args: { p_event_type: string; p_area: string | null };
        Returns: UUID;
      };
      admin_upsert_group_metric_settings: {
        Args: {
          p_group_id: UUID;
          p_capacity_override: number | null;
          p_capacity_warning_threshold_pct_override: number | null;
          p_healthy_attendance_pct_override: number | null;
          p_manual_health_status_override: E.GroupHealthStatus | null;
          p_exclude_from_capacity_metrics: boolean;
          p_admin_metric_notes: string | null;
          p_check_in_due_offset_hours_override: number | null;
        };
        Returns: UUID;
      };
      admin_change_leader_role: {
        Args: { p_profile_id: UUID; p_new_role: E.UserRole };
        Returns: UUID;
      };
      admin_create_guest: {
        Args: {
          p_full_name: string;
          p_email: string | null;
          p_phone: string | null;
          p_first_attended_group_id: UUID | null;
          p_first_attended_date: DateString | null;
          p_pipeline_stage: E.GuestPipelineStage;
          p_assigned_group_id: UUID | null;
          p_follow_up_owner_id: UUID | null;
          p_notes: string | null;
        };
        Returns: UUID;
      };
      admin_update_guest_pipeline: {
        Args: {
          p_guest_id: UUID;
          p_pipeline_stage: E.GuestPipelineStage;
          p_set_assigned_group_id: boolean;
          p_assigned_group_id: UUID | null;
          p_set_follow_up_owner_id: boolean;
          p_follow_up_owner_id: UUID | null;
          p_set_notes: boolean;
          p_notes: string | null;
        };
        Returns: UUID;
      };
      admin_create_follow_up: {
        Args: {
          p_type: E.FollowUpType;
          p_title: string;
          p_related_group_id: UUID | null;
          p_related_member_id: UUID | null;
          p_related_guest_id: UUID | null;
          p_assigned_to: UUID | null;
          p_priority: E.FollowUpPriority;
          p_due_date: DateString | null;
          p_leader_visible_note: string | null;
          p_admin_private_note: string | null;
        };
        Returns: UUID;
      };
      admin_update_follow_up_status: {
        Args: {
          p_follow_up_id: UUID;
          p_status: E.FollowUpStatus;
          p_set_leader_visible_note: boolean;
          p_leader_visible_note: string | null;
          p_set_admin_private_note: boolean;
          p_admin_private_note: string | null;
        };
        Returns: UUID;
      };
      leader_update_follow_up_status: {
        Args: { p_follow_up_id: UUID; p_status: E.FollowUpStatus };
        Returns: UUID;
      };
      admin_create_group_calendar_event: {
        Args: {
          p_group_id: UUID;
          p_event_date: DateString;
          p_start_time: string | null;
          p_end_time: string | null;
          p_event_type: E.GroupCalendarEventType;
          p_status: E.GroupCalendarEventStatus;
          p_title: string | null;
          p_description: string | null;
        };
        Returns: UUID;
      };
      admin_update_group_calendar_event: {
        Args: {
          p_event_id: UUID;
          p_event_date: DateString;
          p_start_time: string | null;
          p_end_time: string | null;
          p_event_type: E.GroupCalendarEventType;
          p_status: E.GroupCalendarEventStatus;
          p_title: string | null;
          p_description: string | null;
        };
        Returns: UUID;
      };
      admin_archive_group_calendar_event: {
        Args: { p_event_id: UUID };
        Returns: UUID;
      };
      admin_restore_group_calendar_event: {
        Args: { p_event_id: UUID };
        Returns: UUID;
      };
      leader_create_group_calendar_event: {
        Args: {
          p_group_id: UUID;
          p_event_date: DateString;
          p_start_time: string | null;
          p_end_time: string | null;
          p_event_type: E.GroupCalendarEventType;
          p_status: E.GroupCalendarEventStatus;
          p_title: string | null;
          p_description: string | null;
        };
        Returns: UUID;
      };
      leader_update_group_calendar_event: {
        Args: {
          p_event_id: UUID;
          p_event_date: DateString;
          p_start_time: string | null;
          p_end_time: string | null;
          p_event_type: E.GroupCalendarEventType;
          p_status: E.GroupCalendarEventStatus;
          p_title: string | null;
          p_description: string | null;
        };
        Returns: UUID;
      };
      leader_archive_group_calendar_event: {
        Args: { p_event_id: UUID };
        Returns: UUID;
      };
      leader_restore_group_calendar_event: {
        Args: { p_event_id: UUID };
        Returns: UUID;
      };
      admin_upsert_shepherd_care_profile: {
        Args: {
          p_shepherd_profile_id: UUID;
          p_current_status: E.ShepherdCareStatus;
          p_set_current_status: boolean;
          p_next_touchpoint_due: DateString | null;
          p_set_next_touchpoint_due: boolean;
          p_admin_summary: string | null;
          p_set_admin_summary: boolean;
        };
        Returns: UUID;
      };
      admin_log_shepherd_care_interaction: {
        Args: {
          p_shepherd_profile_id: UUID;
          p_interaction_at: DateString;
          p_interaction_type: E.ShepherdCareInteractionType;
          p_notes: string | null;
          p_set_next_touchpoint_due: boolean;
          p_next_touchpoint_due: DateString | null;
          p_set_current_status: boolean;
          p_current_status: E.ShepherdCareStatus;
        };
        Returns: UUID;
      };
      admin_create_shepherd_care_follow_up: {
        Args: {
          p_care_profile_id: UUID;
          p_title: string;
          p_due_date: DateString | null;
          p_notes: string | null;
        };
        Returns: UUID;
      };
      admin_enroll_private_note_keys: {
        Args: {
          p_dek_version: number;
          p_slots: Array<Record<string, unknown>>;
        };
        Returns: UUID;
      };
      admin_upsert_shepherd_care_private_note: {
        Args: {
          p_care_profile_id: UUID;
          p_ciphertext: string | null;
          p_iv: string | null;
          p_dek_version: number;
          p_set_body: boolean;
        };
        Returns: UUID;
      };
      admin_add_private_note_key_slot: {
        Args: {
          p_slot_type: string;
          p_credential_id: string | null;
          p_label: string | null;
          p_prf_salt: string | null;
          p_hkdf_salt: string;
          p_wrapped_dek: string;
          p_wrap_iv: string;
        };
        Returns: UUID;
      };
      admin_rotate_private_note_recovery: {
        Args: {
          p_hkdf_salt: string;
          p_wrapped_dek: string;
          p_wrap_iv: string;
          p_label: string | null;
        };
        Returns: UUID;
      };
      admin_remove_private_note_key_slot: {
        Args: { p_slot_id: UUID };
        Returns: UUID;
      };
      admin_write_care_note: {
        Args: { p_subject_profile_id: UUID; p_body: string };
        Returns: UUID;
      };
      admin_write_prayer_request: {
        Args: { p_subject_profile_id: UUID; p_body: string };
        Returns: UUID;
      };
      set_note_transparency_grant: {
        Args: { p_subject_profile_id: UUID; p_granted: boolean };
        Returns: UUID;
      };
      leader_write_group_care_note: {
        Args: { p_group_id: UUID; p_body: string };
        Returns: UUID;
      };
      leader_write_group_prayer_request: {
        Args: { p_group_id: UUID; p_body: string };
        Returns: UUID;
      };
      admin_update_shepherd_care_follow_up_status: {
        Args: {
          p_follow_up_id: UUID;
          p_new_status: E.ShepherdCareFollowUpStatus;
        };
        Returns: UUID;
      };
      admin_update_shepherd_care_follow_up: {
        Args: {
          p_follow_up_id: UUID;
          p_title: string;
          p_set_due_date: boolean;
          p_due_date: DateString | null;
          p_set_notes: boolean;
          p_notes: string | null;
        };
        Returns: UUID;
      };
      admin_create_over_shepherd: {
        Args: {
          p_full_name: string;
          p_email: string | null;
          p_phone: string | null;
          p_notes: string | null;
        };
        Returns: UUID;
      };
      admin_update_over_shepherd: {
        Args: {
          p_over_shepherd_id: UUID;
          p_full_name: string;
          p_email: string | null;
          p_phone: string | null;
          p_notes: string | null;
          p_active: boolean;
        };
        Returns: UUID;
      };
      admin_assign_shepherd_to_over_shepherd: {
        Args: {
          p_shepherd_profile_id: UUID;
          p_over_shepherd_id: UUID;
          p_assigned_at: DateString | null;
        };
        Returns: UUID;
      };
      admin_end_shepherd_coverage_assignment: {
        Args: {
          p_assignment_id: UUID;
          p_ended_at: DateString | null;
        };
        Returns: UUID;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface GroupDashboardSummaryDTO {
  group_id: UUID;
  name: string;
  lifecycle_status: E.GroupLifecycleStatus;
  health_status: E.GroupHealthStatus;
  active_members: number;
  latest_meeting_week: DateString | null;
}
