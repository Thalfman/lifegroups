import type * as E from "./enums";

type UUID = string;
type Timestamp = string;
type DateString = string;

export interface ProfilesRow {
  id: UUID;
  auth_user_id: UUID | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: E.UserRole;
  status: E.ProfileStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  life_stage: E.GroupLifeStage | null;
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
}

export interface AppSettingsRow {
  id: UUID;
  setting_key: string;
  setting_value: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  group_id: UUID;
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
        Insert: InsertOf<AuditEventsRow, "id" | "created_at" | "metadata">;
        Update: Partial<AuditEventsRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingsRow;
        Insert: InsertOf<AppSettingsRow, "id" | "created_at" | "updated_at">;
        Update: Partial<AppSettingsRow>;
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
          "id" | "created_at" | "updated_at" | "completed_at" | "status"
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
