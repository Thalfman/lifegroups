// Declarative RPC gateway for the admin surface (the "RPC gateway" half of
// ADR 0001). One typed table per channel maps each LITERAL Postgres function
// name to its argument shape; the generic entry points (`adminRpc`,
// `adminJsonRpc`, `adminTextRpc`) pin name + args together at the call site
// and delegate to `lib/shared/rpc.ts`, which owns the supabase-js `as never`
// cast and the per-channel trust-boundary read. The gateway does no
// validation of its own -- the action layer validates first.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GroupAudienceCategory,
  GroupCalendarEventStatus,
  GroupCalendarEventType,
  GuestPipelineStage,
  LeaderReadinessStage,
  MeetingFrequency,
  MeetingWeekParity,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
  ProspectState,
  RoleInGroup,
  ShepherdCareFollowUpStatus,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
  UserRole,
} from "@/types/enums";
import {
  callUuidRpc,
  callJsonRpc,
  callTextRpc,
  type UuidRpcResult,
  type JsonRpcResult,
  type TextRpcResult,
} from "@/lib/shared/rpc";

// ---------------------------------------------------------------------------
// Named argument shapes. These predate the table and are imported by action /
// validation modules, so they stay exported unchanged; the args maps below
// reference them by name.
// ---------------------------------------------------------------------------

export type GroupRpcArgs = {
  p_name: string;
  p_description: string | null;
  p_meeting_day: string | null;
  p_meeting_time: string | null;
  p_location_area: string | null;
  p_address_optional: string | null;
  p_capacity: number | null;
  p_meeting_frequency: MeetingFrequency;
  p_meeting_week_parity: MeetingWeekParity | null;
  p_audience_category: GroupAudienceCategory | null;
  // #398: the group's category id (its cell). null = Uncategorized. Replaces
  // the retired p_life_stage argument.
  p_category_id: string | null;
  p_launched_on: string | null;
};

export type AdminCreateGuestArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_first_attended_group_id: string | null;
  p_first_attended_date: string | null;
  p_pipeline_stage: GuestPipelineStage;
  p_assigned_group_id: string | null;
  p_follow_up_owner_id: string | null;
  p_notes: string | null;
};

export type AdminUpdateGuestPipelineArgs = {
  p_guest_id: string;
  p_pipeline_stage: GuestPipelineStage;
  p_set_assigned_group_id: boolean;
  p_assigned_group_id: string | null;
  p_set_follow_up_owner_id: boolean;
  p_follow_up_owner_id: string | null;
  p_set_notes: boolean;
  p_notes: string | null;
};

export type AdminCreateFollowUpArgs = {
  p_type: FollowUpType;
  p_title: string;
  p_related_group_id: string | null;
  p_related_member_id: string | null;
  p_related_guest_id: string | null;
  p_assigned_to: string | null;
  p_priority: FollowUpPriority;
  p_due_date: string | null;
  p_leader_visible_note: string | null;
  p_admin_private_note: string | null;
};

export type AdminUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: FollowUpStatus;
  p_set_leader_visible_note: boolean;
  p_leader_visible_note: string | null;
  p_set_admin_private_note: boolean;
  p_admin_private_note: string | null;
};

export type AdminCreateGroupCalendarEventArgs = {
  p_group_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

export type AdminUpdateGroupCalendarEventArgs = {
  p_event_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

export type AdminUpsertShepherdCareProfileArgs = {
  p_shepherd_profile_id: string;
  p_current_status: ShepherdCareStatus;
  p_set_current_status: boolean;
  p_next_touchpoint_due: string | null;
  p_set_next_touchpoint_due: boolean;
  p_admin_summary: string | null;
  p_set_admin_summary: boolean;
};

export type AdminLogShepherdCareInteractionArgs = {
  p_shepherd_profile_id: string;
  p_interaction_at: string;
  p_interaction_type: ShepherdCareInteractionType;
  p_notes: string | null;
  p_set_next_touchpoint_due: boolean;
  p_next_touchpoint_due: string | null;
  p_set_current_status: boolean;
  p_current_status: ShepherdCareStatus;
};

export type AdminCreateShepherdCareFollowUpArgs = {
  p_care_profile_id: string;
  p_title: string;
  p_due_date: string | null;
  p_notes: string | null;
};

export type AdminUpdateShepherdCareFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_new_status: ShepherdCareFollowUpStatus;
};

export type AdminUpdateShepherdCareFollowUpArgs = {
  p_follow_up_id: string;
  p_title: string;
  p_set_due_date: boolean;
  p_due_date: string | null;
  p_set_notes: boolean;
  p_notes: string | null;
};

export type AdminEnrollPrivateNoteKeysArgs = {
  p_dek_version: number;
  p_slots: Array<Record<string, unknown>>;
};

export type AdminUpsertShepherdCarePrivateNoteArgs = {
  p_care_profile_id: string;
  p_ciphertext: string | null;
  p_iv: string | null;
  p_dek_version: number;
  p_set_body: boolean;
};

export type AdminAddPrivateNoteKeySlotArgs = {
  p_slot_type: string;
  p_credential_id: string | null;
  p_label: string | null;
  p_prf_salt: string | null;
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
};

export type AdminRotatePrivateNoteRecoveryArgs = {
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
  p_label: string | null;
};

export type AdminCreateOverShepherdArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
};

export type AdminUpdateOverShepherdArgs = {
  p_over_shepherd_id: string;
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
  p_active: boolean;
};

export type AdminAssignShepherdToOverShepherdArgs = {
  p_shepherd_profile_id: string;
  p_over_shepherd_id: string;
  p_assigned_at: string | null;
};

export type AdminEndShepherdCoverageAssignmentArgs = {
  p_assignment_id: string;
  p_ended_at: string | null;
};

export type AdminCreateLaunchPlanningScenarioArgs = {
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export type AdminUpdateLaunchPlanningScenarioArgs = {
  p_scenario_id: string;
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export type AdminUpsertGroupHealthAssessmentArgs = {
  p_group_id: string;
  p_period_month: string;
  p_attendance_pct: number | null;
  p_attendance_weeks_counted: number;
  p_computed_numeric: number | null;
  p_computed_letter: string | null;
};

export type AdminSetGroupHealthRatingsArgs = {
  p_group_id: string;
  p_period_month: string;
  p_spiritual_growth_score: number | null;
  p_spiritual_growth_note: string | null;
  p_group_question_score: number | null;
  // Admin IM 05 (#265): the open follow-up flag, set/cleared from the same
  // editor drawer save.
  p_needs_follow_up: boolean;
  p_attendance_pct: number | null;
  p_attendance_weeks_counted: number;
  p_computed_numeric: number | null;
  p_computed_letter: string | null;
};

export type AdminSetLeaderRubricGradeArgs = {
  p_profile_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: "this_month" | "until_cleared" | null;
  p_override_period_month: string | null;
};

export type AdminSetGroupRubricGradeArgs = {
  p_group_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: string | null;
  p_override_period_month: string | null;
};

export type AdminWriteCareNoteArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export type AdminWritePrayerRequestArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export type SetNoteTransparencyGrantArgs = {
  p_subject_profile_id: string;
  p_granted: boolean;
};

// ---------------------------------------------------------------------------
// The uuid-channel args map. Keys are the LITERAL Postgres function names;
// every RPC here returns a uuid on success (read through `readUuidRpcData`).
// No-argument RPCs take `Record<string, never>` -- pass `{}` at the call site.
// ---------------------------------------------------------------------------

export type AdminUuidRpcArgs = {
  admin_create_leader_profile: {
    p_full_name: string;
    p_email: string;
    p_phone: string | null;
  };
  admin_create_member: {
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
  };
  admin_assign_leader_to_group: {
    p_group_id: string;
    p_profile_id: string;
    p_role: RoleInGroup;
  };
  admin_assign_member_to_group: { p_group_id: string; p_member_id: string };
  // Group roster create-and-assign (#643): create a brand-new member or leader
  // AND put them on one group's roster in a single audited transaction. p_role
  // is the in-group role for leaders (leader/co_leader) and null for members.
  admin_add_person_to_group: {
    p_group_id: string;
    p_kind: "member" | "leader";
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
    p_role: RoleInGroup | null;
  };
  admin_deactivate_profile: { p_profile_id: string };
  admin_deactivate_member: { p_member_id: string };
  // Roster removal (Groups/People overhaul): take one person off one group's
  // roster without touching the person's status. Soft flags only — the inverse
  // of the two assign RPCs above, which revive these rows on re-assign.
  admin_unassign_leader_from_group: {
    p_group_id: string;
    p_profile_id: string;
  };
  admin_end_group_membership: { p_group_id: string; p_member_id: string };
  // Phase 5A.2 group management RPCs.
  admin_create_group: GroupRpcArgs;
  admin_update_group: GroupRpcArgs & { p_group_id: string };
  admin_close_group: { p_group_id: string };
  admin_reopen_group: { p_group_id: string };
  // Phase 5A.3 super admin role management RPC.
  super_admin_update_profile_role: {
    p_profile_id: string;
    p_new_role: UserRole;
  };
  // Phase SAC.1 (#159) Super Admin Console platform-config write. The RPC
  // merges the submitted whitelisted keys into platform_config and writes a
  // paired audit_events row in one transaction, behind the super-admin gate.
  super_admin_set_platform_config: { p_config: Record<string, unknown> };
  // Phase SAC.3 (#163) account management: set a profile's active/inactive
  // status, and log a password-reset email send. Both are audited +
  // super-admin gated in the RPC.
  super_admin_set_profile_status: {
    p_profile_id: string;
    p_status: "active" | "inactive";
  };
  super_admin_log_password_reset: { p_profile_id: string };
  // Phase IL.1 — mint a shareable self-signup invite link. Returns the new
  // invitations.id. The raw token is generated + hashed in the action layer;
  // only its hash reaches the RPC.
  super_admin_create_invitation: {
    p_token_hash: string;
    p_role: UserRole;
    p_group_id: string | null;
    p_single_use: boolean;
    p_expires_at: string;
  };
  // Phase SAC.4 (#164) coverage editing from the Super Admin Console reuses
  // the existing Phase 5D.1 coverage RPCs (admin_assign_shepherd_to_over_shepherd
  // / admin_end_shepherd_coverage_assignment below). Those gate on
  // auth_is_admin(), which super_admin satisfies, so no new RPC is needed.
  //
  // PRD-SAC6 (#288) Clean Slate history wipe. Takes no arguments; the RPC
  // snapshots + deletes the history tables and writes the paired audit row in
  // one transaction, returning the snapshot id (the action reads counts back
  // from the snapshot row by id — not through this uuid channel).
  super_admin_clean_slate_wipe: Record<string, never>;
  // PRD-SAC6 (#293) Clean Slate in-DB revert. Restores the snapshot payload
  // (explicit id, else the latest un-restored snapshot) and returns the
  // restored snapshot id; the action reads counts back from the snapshot row
  // by id.
  super_admin_clean_slate_revert: { p_snapshot_id: string | null };
  // PRD-SAC6 (#294) Clean Slate import from a JSON export. The payload is the
  // parsed export file; the RPC does authoritative validation + restore and
  // returns the paired audit row id.
  super_admin_clean_slate_import: { p_payload: Record<string, unknown> };
  // PRD-SAC6 follow-up: one-click launch prep. In one transaction the RPC
  // mutes the three launch-optics warning flags, runs the Clean Slate history
  // wipe (idempotent — nothing_to_wipe is swallowed), and purges the
  // per-category history-reset snapshots. Returns the wipe snapshot id, or
  // null when history was already clear (the action reads cleared counts back
  // from the snapshot row).
  super_admin_launch_prep: Record<string, never>;
  // Danger-Zone consolidation: one-click "reset everything to a clean launch
  // state". In one transaction the RPC runs launch prep (mute flags +
  // clean-slate history wipe + category-snapshot purge) and resets the two
  // time-based "Needs attention" cards (care + health) to a global baseline.
  // Returns the history wipe snapshot id, or null when history was already
  // clear (the action reads cleared counts back from the snapshot row).
  super_admin_reset_all: Record<string, never>;
  // PRD-SAC6 follow-up: per-category history reset. Snapshots + deletes one
  // category's history tables and writes the paired audit row in one
  // transaction, returning the snapshot id (the action reads counts back from
  // the snapshot row).
  super_admin_reset_history_category: { p_category: string };
  // PRD-SAC6 follow-up: revert a per-category history reset. Restores only the
  // snapshot's category tables and returns the restored snapshot id.
  super_admin_reset_history_category_revert: { p_snapshot_id: string };
  // PRD-SAC6 (#290) standalone audit-log reset (archive-then-purge). Returns
  // the id of the single fresh audit row the purge writes.
  super_admin_reset_audit_logs: Record<string, never>;
  // health-checks-reset: set a leader-care reset baseline (global or
  // per-leader) and clean-slate field-wipe the targeted care profiles. Returns
  // the snapshot id (the action reads counts back from the snapshot row).
  super_admin_reset_care_attention: {
    p_scope: string;
    p_entity_id: string | null;
  };
  // health-checks-reset: set a health-check reset baseline (global or
  // per-group). No row mutation — "missing" is absence-derived. Returns the
  // snapshot id.
  super_admin_reset_health_attention: {
    p_scope: string;
    p_entity_id: string | null;
  };
  // health-checks-reset: revert an attention reset, restoring the prior
  // baseline and (for care) the snapshotted profile field values. Returns the
  // snapshot id.
  super_admin_reset_attention_revert: { p_snapshot_id: string };
  // ADR 0014 (#312–#316) permanent deletion. The delete RPC snapshots the row
  // + its set-null dependents into a tombstone, writes the paired audit row,
  // and physically removes the row, returning the tombstone id.
  super_admin_permanent_delete: { p_entity_type: string; p_id: string };
  // Phase 5A.4 admin settings + leader-role-swap RPCs.
  admin_update_metric_defaults: { p_settings: Record<string, unknown> };
  admin_upsert_group_metric_settings: {
    p_group_id: string;
    p_capacity_override: number | null;
    p_capacity_warning_threshold_pct_override: number | null;
    p_healthy_attendance_pct_override: number | null;
    p_manual_health_status_override: string | null;
    p_exclude_from_capacity_metrics: boolean;
    p_admin_metric_notes: string | null;
    p_check_in_due_offset_hours_override: number | null;
    p_allow_over_capacity: boolean;
  };
  // Phase 5A.5 reset-to-defaults helper. Takes no arguments; the RPC
  // snapshots the current values, restores the baseline, and writes the
  // audit row in one transaction.
  admin_reset_metric_defaults: Record<string, never>;
  admin_change_leader_role: {
    p_profile_id: string;
    p_new_role: "leader" | "co_leader";
  };
  // Julian P2: record/upsert a church attendance snapshot by date.
  admin_record_church_attendance_snapshot: {
    p_snapshot_date: string;
    p_attendance_count: number;
    p_note: string | null;
  };
  // Julian P4: multiplication candidate writes.
  admin_create_multiplication_candidate: {
    // Type-first: optional multiplying group (null = type-only watch).
    p_group_id: string | null;
    p_target_year: number | null;
    p_status: MultiplicationCandidateStatus;
    p_shepherd_willing: boolean;
    p_needs_similar_stage: boolean;
    p_notes: string | null;
    p_successor_designate: string | null;
    p_meeting_time: MultiplicationMeetingTime | null;
    p_leader_pipeline_id: string | null;
    // ADR 0022: Julian-fed headcount. Null falls back to the in-app roster count.
    p_manual_member_count: number | null;
    // The candidate's cell (audience × category). Null when a group is attached
    // (the RPC derives the cell from the group); required for a type-only watch.
    p_audience_category: GroupAudienceCategory | null;
    p_category_id: string | null;
  };
  admin_update_multiplication_candidate: {
    p_candidate_id: string;
    p_target_year: number | null;
    p_status: MultiplicationCandidateStatus;
    p_shepherd_willing: boolean;
    p_needs_similar_stage: boolean;
    p_notes: string | null;
    p_successor_designate: string | null;
    p_meeting_time: MultiplicationMeetingTime | null;
    p_leader_pipeline_id: string | null;
    // ADR 0022: Julian-fed headcount. Null falls back to the in-app roster count.
    p_manual_member_count: number | null;
    // The candidate's cell (audience × category). Null when a group is attached
    // (the RPC derives the cell from the group); required for a type-only watch.
    p_audience_category: GroupAudienceCategory | null;
    p_category_id: string | null;
    // Type-first: optional multiplying group (null = type-only watch).
    p_group_id: string | null;
  };
  admin_archive_multiplication_candidate: { p_candidate_id: string };
  // Capacity & Multiplication #183: Leader Pipeline (apprentice) writes.
  admin_create_apprentice: {
    p_group_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  };
  admin_update_apprentice: {
    p_apprentice_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  };
  admin_advance_apprentice_stage: {
    p_apprentice_id: string;
    p_readiness_stage: LeaderReadinessStage;
  };
  admin_archive_apprentice: { p_apprentice_id: string };
  // Capacity & Multiplication #185: set a group's target size (effective
  // source).
  admin_set_group_capacity_target: {
    p_group_id: string;
    p_target: number | null;
  };
  // Phase 5C.0 guest + follow-up admin RPCs.
  admin_create_guest: AdminCreateGuestArgs;
  admin_update_guest_pipeline: AdminUpdateGuestPipelineArgs;
  // #375 Interest Funnel: Prospect create + transition. The transition RPC is
  // the authoritative funnel gate (legal edges + group-required +
  // joined-archives), rejecting with the fixed tokens illegal_transition /
  // group_required / missing_prospect. A null p_group_id carries the current
  // group forward.
  admin_create_prospect: {
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
    // #399: the DESIRED (top type × category) cell named at intake. Both null
    // when no cell was chosen.
    p_desired_audience_category: GroupAudienceCategory | null;
    p_desired_category_id: string | null;
  };
  admin_transition_prospect: {
    p_prospect_id: string;
    p_state: ProspectState;
    p_group_id: string | null;
  };
  // Admin UX: edit a Prospect's identity fields (no state change) and
  // soft-archive it for cleanup. Both gate on auth_is_admin() in the RPC body
  // and write a paired audit_events row; archive sets archived = true so the
  // board drops it.
  admin_update_prospect: {
    p_prospect_id: string;
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
  };
  admin_archive_prospect: { p_prospect_id: string };
  // #379 pivot slice 7: set a Prospect's single current Next Step (type
  // connect_to_group_leader | follow_up + optional due date + detail) and a
  // separate Additional Note. The next_step jsonb shape is validated in the
  // action layer (validateSetProspectNextStepPayload) and re-validated
  // authoritatively in the RPC. No provider is wired — nothing is sent.
  admin_set_prospect_next_step: {
    p_prospect_id: string;
    p_next_step: Record<string, unknown> | null;
    p_additional_note: string | null;
  };
  admin_create_follow_up: AdminCreateFollowUpArgs;
  admin_update_follow_up_status: AdminUpdateFollowUpStatusArgs;
  // Phase 5A.6 group calendar admin RPCs.
  admin_create_group_calendar_event: AdminCreateGroupCalendarEventArgs;
  admin_update_group_calendar_event: AdminUpdateGroupCalendarEventArgs;
  admin_archive_group_calendar_event: { p_event_id: string };
  admin_restore_group_calendar_event: { p_event_id: string };
  // Phase 5D.0 shepherd care tracker admin RPCs.
  admin_upsert_shepherd_care_profile: AdminUpsertShepherdCareProfileArgs;
  admin_log_shepherd_care_interaction: AdminLogShepherdCareInteractionArgs;
  // Phase SC.1B shepherd care follow-up (task list) admin RPCs.
  admin_create_shepherd_care_follow_up: AdminCreateShepherdCareFollowUpArgs;
  admin_update_shepherd_care_follow_up_status: AdminUpdateShepherdCareFollowUpStatusArgs;
  admin_update_shepherd_care_follow_up: AdminUpdateShepherdCareFollowUpArgs;
  // Admin UX: soft-archive a care follow-up (sets archived_at) so it leaves
  // every queue. Status/completed_at are untouched; the RPC writes a paired
  // audit row.
  admin_archive_shepherd_care_follow_up: { p_follow_up_id: string };
  // Phase SC.4 private care notes admin RPCs. The bytea columns travel as
  // base64 strings (the RPC decodes them); the server only ever holds
  // ciphertext. admin_enroll_private_note_keys returns the mandatory recovery
  // slot's id (see the migration header deviation).
  admin_enroll_private_note_keys: AdminEnrollPrivateNoteKeysArgs;
  admin_upsert_shepherd_care_private_note: AdminUpsertShepherdCarePrivateNoteArgs;
  // Phase SC.4 (#113) key-slot lifecycle RPCs. bytea columns travel as base64.
  admin_add_private_note_key_slot: AdminAddPrivateNoteKeySlotArgs;
  admin_rotate_private_note_recovery: AdminRotatePrivateNoteRecoveryArgs;
  admin_remove_private_note_key_slot: { p_slot_id: string };
  // Phase 5D.1 over-shepherd coverage tracking admin RPCs.
  admin_create_over_shepherd: AdminCreateOverShepherdArgs;
  admin_update_over_shepherd: AdminUpdateOverShepherdArgs;
  // Admin UX: a focused active toggle so a list/detail "Archive"/"Restore"
  // button can soft-archive or restore an over-shepherd without re-sending the
  // whole record. Maintains archived_at; writes a paired audit row.
  admin_set_over_shepherd_active: {
    p_over_shepherd_id: string;
    p_active: boolean;
  };
  admin_assign_shepherd_to_over_shepherd: AdminAssignShepherdToOverShepherdArgs;
  admin_end_shepherd_coverage_assignment: AdminEndShepherdCoverageAssignmentArgs;
  // LP.1 launch planning RPC.
  admin_update_launch_planning_assumptions: {
    p_settings: Record<string, unknown>;
  };
  // LP.2 launch planning scenario RPCs.
  admin_create_launch_planning_scenario: AdminCreateLaunchPlanningScenarioArgs;
  admin_update_launch_planning_scenario: AdminUpdateLaunchPlanningScenarioArgs;
  admin_archive_launch_planning_scenario: { p_scenario_id: string };
  admin_set_current_launch_planning_scenario: { p_scenario_id: string };
  // #127 group-health tracer: persist a group's monthly attendance dimension +
  // computed A-D grade. The rolling-window math is done in TS first
  // (lib/admin/group-health.ts); this just writes the already-computed values.
  admin_upsert_group_health_assessment: AdminUpsertGroupHealthAssessmentArgs;
  // #128 group-health rated dimensions: persist the admin-entered
  // spiritual-growth and relayed group-question 1–5 ratings (+ recomputed
  // grade) for a group's month. The composite math is done in TS first; the
  // RPC forces the group-question leader-reported provenance flag from the
  // score's presence.
  admin_set_group_health_ratings: AdminSetGroupHealthRatingsArgs;
  // #374 / ADR 0018 Health Rubric: upsert the current rubric for a kind
  // (group/leader). p_criteria is the validated {key,label,weight} array; the
  // weight-to-100 check is done in TS first, the RPC re-guards the JSON shape.
  admin_set_health_rubric: {
    p_kind: "group" | "leader";
    p_criteria: Array<Record<string, unknown>>;
  };
  // #380 Multiplication Pillars (updated #401): upsert one group type's pillar
  // config (thresholds + trigger rubric) for a ministry year. #401 retired the
  // fed-capacity payload — capacity is now a derived per-cell issue. The two
  // jsonb payloads are validated in TS first; the RPC re-guards their object
  // shape.
  admin_set_multiplication_config: {
    p_group_type: GroupAudienceCategory;
    p_ministry_year: number;
    p_thresholds: Record<string, unknown>;
    p_trigger: Record<string, unknown>;
  };
  // #402 / PRD §2.4 per-cell readiness rule: upsert the GLOBAL readiness rule
  // for a ministry year (interest/capacity/group+leader health in natural
  // units). The rule jsonb is validated in TS first; the RPC re-guards its
  // object shape.
  admin_set_readiness_rule: {
    p_ministry_year: number;
    p_rule: Record<string, unknown>;
  };
  // #402 / PRD §2.4: set a cell's trigger overrides (a partial of the global
  // rule; absent pillars inherit). Upserts
  // category_type_targets.trigger_overrides on the same (audience_category,
  // category_id) conflict target as the cell apply RPC. An empty `{}` clears
  // the cell's overrides back to the global rule.
  admin_set_cell_trigger_overrides: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_overrides: Record<string, unknown>;
  };
  // #410 / ADR 0021 per-TYPE readiness rule: upsert the per-type (Audience)
  // rule for a ministry year — the MIDDLE tier of the global → per-type →
  // per-cell cascade. A partial of the global rule (absent pillars inherit);
  // an empty `{}` clears it back to the global rule. The jsonb is validated in
  // TS first; the RPC re-guards shape.
  admin_set_audience_readiness_rule: {
    p_ministry_year: number;
    p_audience_category: GroupAudienceCategory;
    p_rule: Record<string, unknown>;
  };
  // #378 / ADR 0018 (pivot slice 5) Leader-Health Grade: upsert a leader's
  // grade for a ministry year. The roll-up + override resolution are done in
  // TS first (lib/admin/leader-rubric-grade.ts); this persists the
  // already-computed letter (+ raw per-criterion scores and any override)
  // through the audited RPC. The override letter + scope travel together
  // (both null, or both set).
  admin_set_leader_rubric_grade: AdminSetLeaderRubricGradeArgs;
  // #377 / ADR 0018 Group-Health Grade by rubric: upsert a group's rubric
  // grade for a ministry year (per-criterion 0–100 scores + the computed A–F
  // letter + an optional letter override under this-month / until-cleared
  // scope). The letter is recomputed in TS first via the pure facade
  // (lib/admin/group-rubric-grade.ts); the RPC re-validates score range +
  // letters.
  admin_set_group_rubric_grade: AdminSetGroupRubricGradeArgs;
  // Pivot slice 9 (#381 / ADR 0017): author-private Care Notes + Prayer
  // Requests + the per-subject transparency toggle. The note/prayer body
  // travels as plaintext text; the RPC derives the author server-side and
  // gates authorship on the over-shepherd coverage predicate. The transparency
  // toggle is Ministry-Admin controlled. DISTINCT from the SC.4 encrypted
  // private care note.
  admin_write_care_note: AdminWriteCareNoteArgs;
  admin_write_prayer_request: AdminWritePrayerRequestArgs;
  set_note_transparency_grant: SetNoteTransparencyGrantArgs;
  // #396 Settings > Groups: the group Category catalog + the (top type ×
  // category) cell matrix. Free-form catalog CRUD (create / rename / archive)
  // and the cell apply/unapply, each through an audited SECURITY DEFINER RPC.
  // Archive is the reversible soft delete (Archive convention); the cell
  // upsert flips the (audience_category × category) row's active flag.
  admin_create_group_category: { p_label: string };
  admin_rename_group_category: { p_category_id: string; p_label: string };
  admin_archive_group_category: { p_category_id: string };
  admin_set_category_type_cell: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_active: boolean;
  };
  // #400 / PRD §2.3: set a cell's target group count. Upserts the cell row's
  // target_count on the same (audience_category, category_id) conflict target
  // as the cell apply RPC. Tracking only — does NOT feed the multiply trigger.
  admin_set_category_type_target_count: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_count: number;
  };
  // Settings › Groups "+ Add existing group": tag an existing group into a
  // cell (audience × category). Focused audited write — updates ONLY the
  // group's audience_category + category_id under a row lock, rejecting closed
  // groups and inactive/archived cells. Used instead of replaying
  // admin_update_group so a concurrent edit to the group's other fields can't
  // be clobbered.
  admin_set_group_category: {
    p_group_id: string;
    p_audience_category: GroupAudienceCategory;
    p_category_id: string;
  };
};

// ---------------------------------------------------------------------------
// The jsonb-channel args map. These RPCs return a structured jsonb document
// (passed through as `unknown`; the action layer validates its shape).
// ---------------------------------------------------------------------------

export type AdminJsonRpcArgs = {
  // activity-reset: set/replace the single global activity baseline at today
  // (church-local), flooring the Home Recent-activity tiles WITHOUT deleting
  // any domain rows. Returns the baseline date (a jsonb scalar, not a uuid).
  super_admin_reset_activity: Record<string, never>;
  // activity-reset: remove the global activity baseline so the tiles return
  // to all-time counts. Returns true when a baseline was removed.
  super_admin_clear_activity_reset: Record<string, never>;
  // ADR 0014 (#313) preflight: returns a jsonb report of blocking dependents +
  // captured set-null dependents (and an opaque confidential flag for #314),
  // so the danger-zone panel can name what blocks a deletion before attempting
  // it.
  super_admin_permanent_delete_preflight: {
    p_entity_type: string;
    p_id: string;
  };
  // ADR 0014 (#315) recovery: re-inserts a tombstoned row from its snapshot
  // and re-links the captured set-null dependents, returning a jsonb report of
  // how many links were restored vs skipped.
  super_admin_restore_tombstone: { p_tombstone_id: string };
};

// ---------------------------------------------------------------------------
// The text-channel args map. These RPCs return a plain `text` scalar that is
// NOT a uuid, so they must not go through the uuid trust-boundary read.
// ---------------------------------------------------------------------------

export type AdminTextRpcArgs = {
  // Phase SAC.5 (#165) bulk people import. p_rows is the parsed + de-duped row
  // array from lib/admin/people-import.ts; the RPC returns the created COUNT
  // as a `text` scalar (e.g. "0", "3") — NOT a uuid. It must use the text
  // channel: the uuid channel would run the count through `readUuidRpcData`,
  // which rejects any non-uuid string as null, so every successful import
  // would read as a failure.
  super_admin_bulk_import_people: { p_rows: Array<Record<string, unknown>> };
};

// ---------------------------------------------------------------------------
// Generic entry points. The literal key pins the Postgres function name and
// its argument shape together at the call site.
// ---------------------------------------------------------------------------

export function adminRpc<K extends keyof AdminUuidRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminUuidRpcArgs[K]
): Promise<UuidRpcResult> {
  return callUuidRpc(client, name, args);
}

export function adminJsonRpc<K extends keyof AdminJsonRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminJsonRpcArgs[K]
): Promise<JsonRpcResult> {
  return callJsonRpc(client, name, args);
}

export function adminTextRpc<K extends keyof AdminTextRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminTextRpcArgs[K]
): Promise<TextRpcResult> {
  return callTextRpc(client, name, args);
}
