// Typed wrappers around the admin Postgres RPCs. Each wrapper pins the
// exact function name and argument shape and delegates to `callUuidRpc`,
// which owns the supabase-js `as never` cast and the uuid trust-boundary
// read. The wrappers do no validation of their own -- the action layer
// validates first. See `lib/shared/rpc.ts`.

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
  type UuidRpcResult,
  type JsonRpcResult,
} from "@/lib/shared/rpc";

type RpcResult = UuidRpcResult;

export function rpcAdminCreateLeaderProfile(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string; p_phone: string | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_leader_profile", args);
}

export function rpcAdminCreateMember(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string | null; p_phone: string | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_member", args);
}

export function rpcAdminAssignLeaderToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_profile_id: string; p_role: RoleInGroup }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_assign_leader_to_group", args);
}

export function rpcAdminAssignMemberToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_member_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_assign_member_to_group", args);
}

export function rpcAdminDeactivateProfile(
  client: AppSupabaseClient,
  args: { p_profile_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_deactivate_profile", args);
}

export function rpcAdminDeactivateMember(
  client: AppSupabaseClient,
  args: { p_member_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_deactivate_member", args);
}

// Phase 5A.2 group management RPCs.

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

export function rpcAdminCreateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_group", args);
}

export function rpcAdminUpdateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs & { p_group_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_group", args);
}

export function rpcAdminCloseGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_close_group", args);
}

export function rpcAdminReopenGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_reopen_group", args);
}

// Phase 5A.3 super admin role management RPC.

export function rpcSuperAdminUpdateProfileRole(
  client: AppSupabaseClient,
  args: { p_profile_id: string; p_new_role: UserRole }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_update_profile_role", args);
}

// Phase SAC.1 (#159) Super Admin Console platform-config write. The RPC merges
// the submitted whitelisted keys into platform_config and writes a paired
// audit_events row in one transaction, behind the super-admin gate.
export function rpcSuperAdminSetPlatformConfig(
  client: AppSupabaseClient,
  args: { p_config: Record<string, unknown> }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_set_platform_config", args);
}

// Phase SAC.3 (#163) account management: set a profile's active/inactive
// status, and log a password-reset email send. Both are audited + super-admin
// gated in the RPC.
export function rpcSuperAdminSetProfileStatus(
  client: AppSupabaseClient,
  args: { p_profile_id: string; p_status: "active" | "inactive" }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_set_profile_status", args);
}

export function rpcSuperAdminLogPasswordReset(
  client: AppSupabaseClient,
  args: { p_profile_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_log_password_reset", args);
}

// Phase IL.1 — mint a shareable self-signup invite link. Returns the new
// invitations.id. The raw token is generated + hashed in the action layer; only
// its hash reaches the RPC.
export function rpcSuperAdminCreateInvitation(
  client: AppSupabaseClient,
  args: {
    p_token_hash: string;
    p_role: UserRole;
    p_group_id: string | null;
    p_single_use: boolean;
    p_expires_at: string;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_create_invitation", args);
}

// Phase SAC.4 (#164) coverage editing from the Super Admin Console reuses the
// existing Phase 5D.1 coverage RPCs (rpcAdminAssignShepherdToOverShepherd /
// rpcAdminEndShepherdCoverageAssignment). Those gate on auth_is_admin(), which
// super_admin satisfies, so no new RPC is needed.

// Phase SAC.5 (#165) bulk people import. p_rows is the parsed + de-duped row
// array from lib/admin/people-import.ts; the RPC returns the created count as
// text via the shared uuid-string return channel.
export function rpcSuperAdminBulkImportPeople(
  client: AppSupabaseClient,
  args: { p_rows: Array<Record<string, unknown>> }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_bulk_import_people", args);
}

// PRD-SAC6 (#288) Clean Slate history wipe. Takes no arguments; the RPC
// snapshots + deletes the history tables and writes the paired audit row in one
// transaction, returning the snapshot id (the action reads counts back from the
// snapshot row by id — not through this uuid channel).
export function rpcSuperAdminCleanSlateWipe(
  client: AppSupabaseClient
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_clean_slate_wipe", {});
}

// PRD-SAC6 (#293) Clean Slate in-DB revert. Restores the snapshot payload
// (explicit id, else the latest un-restored snapshot) and returns the restored
// snapshot id; the action reads counts back from the snapshot row by id.
export function rpcSuperAdminCleanSlateRevert(
  client: AppSupabaseClient,
  args: { p_snapshot_id: string | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_clean_slate_revert", args);
}

// PRD-SAC6 (#294) Clean Slate import from a JSON export. The payload is the
// parsed export file; the RPC does authoritative validation + restore and
// returns the paired audit row id.
export function rpcSuperAdminCleanSlateImport(
  client: AppSupabaseClient,
  args: { p_payload: Record<string, unknown> }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_clean_slate_import", args);
}

// PRD-SAC6 follow-up: one-click launch prep. In one transaction the RPC mutes
// the three launch-optics warning flags, runs the Clean Slate history wipe
// (idempotent — nothing_to_wipe is swallowed), and purges the per-category
// history-reset snapshots. Returns the wipe snapshot id, or null when history
// was already clear (the action reads cleared counts back from the snapshot row).
export function rpcSuperAdminLaunchPrep(
  client: AppSupabaseClient
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_launch_prep", {});
}

// Danger-Zone consolidation: one-click "reset everything to a clean launch
// state". In one transaction the RPC runs launch prep (mute flags + clean-slate
// history wipe + category-snapshot purge) and resets the two time-based
// "Needs attention" cards (care + health) to a global baseline. Returns the
// history wipe snapshot id, or null when history was already clear (the action
// reads cleared counts back from the snapshot row).
export function rpcSuperAdminResetAll(
  client: AppSupabaseClient
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_all", {});
}

// PRD-SAC6 follow-up: per-category history reset. Snapshots + deletes one
// category's history tables and writes the paired audit row in one transaction,
// returning the snapshot id (the action reads counts back from the snapshot row).
export function rpcSuperAdminResetHistoryCategory(
  client: AppSupabaseClient,
  args: { p_category: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_history_category", args);
}

// PRD-SAC6 follow-up: revert a per-category history reset. Restores only the
// snapshot's category tables and returns the restored snapshot id.
export function rpcSuperAdminResetHistoryCategoryRevert(
  client: AppSupabaseClient,
  args: { p_snapshot_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_history_category_revert", args);
}

// PRD-SAC6 (#290) standalone audit-log reset (archive-then-purge). Returns the
// id of the single fresh audit row the purge writes.
export function rpcSuperAdminResetAuditLogs(
  client: AppSupabaseClient
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_audit_logs", {});
}

// health-checks-reset: set a leader-care reset baseline (global or per-leader)
// and clean-slate field-wipe the targeted care profiles. Returns the snapshot
// id (the action reads counts back from the snapshot row).
export function rpcSuperAdminResetCareAttention(
  client: AppSupabaseClient,
  args: { p_scope: string; p_entity_id: string | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_care_attention", args);
}

// health-checks-reset: set a health-check reset baseline (global or per-group).
// No row mutation — "missing" is absence-derived. Returns the snapshot id.
export function rpcSuperAdminResetHealthAttention(
  client: AppSupabaseClient,
  args: { p_scope: string; p_entity_id: string | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_health_attention", args);
}

// health-checks-reset: revert an attention reset, restoring the prior baseline
// and (for care) the snapshotted profile field values. Returns the snapshot id.
export function rpcSuperAdminResetAttentionRevert(
  client: AppSupabaseClient,
  args: { p_snapshot_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_reset_attention_revert", args);
}

// activity-reset: set/replace the single global activity baseline at today
// (church-local), flooring the Home Recent-activity tiles WITHOUT deleting any
// domain rows. Returns the baseline date (a jsonb scalar, not a uuid).
export function rpcSuperAdminResetActivity(
  client: AppSupabaseClient
): Promise<JsonRpcResult> {
  return callJsonRpc(client, "super_admin_reset_activity");
}

// activity-reset: remove the global activity baseline so the tiles return to
// all-time counts. Returns true when a baseline was removed.
export function rpcSuperAdminClearActivityReset(
  client: AppSupabaseClient
): Promise<JsonRpcResult> {
  return callJsonRpc(client, "super_admin_clear_activity_reset");
}

// ADR 0014 (#312–#316) permanent deletion. The delete RPC snapshots the row +
// its set-null dependents into a tombstone, writes the paired audit row, and
// physically removes the row, returning the tombstone id.
export function rpcSuperAdminPermanentDelete(
  client: AppSupabaseClient,
  args: { p_entity_type: string; p_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "super_admin_permanent_delete", args);
}

// ADR 0014 (#313) preflight: returns a jsonb report of blocking dependents +
// captured set-null dependents (and an opaque confidential flag for #314), so
// the danger-zone panel can name what blocks a deletion before attempting it.
export function rpcSuperAdminPermanentDeletePreflight(
  client: AppSupabaseClient,
  args: { p_entity_type: string; p_id: string }
): Promise<JsonRpcResult> {
  return callJsonRpc(client, "super_admin_permanent_delete_preflight", args);
}

// ADR 0014 (#315) recovery: re-inserts a tombstoned row from its snapshot and
// re-links the captured set-null dependents, returning a jsonb report of how
// many links were restored vs skipped.
export function rpcSuperAdminRestoreTombstone(
  client: AppSupabaseClient,
  args: { p_tombstone_id: string }
): Promise<JsonRpcResult> {
  return callJsonRpc(client, "super_admin_restore_tombstone", args);
}

// Phase 5A.4 admin settings + leader-role-swap RPCs.

export function rpcAdminUpdateMetricDefaults(
  client: AppSupabaseClient,
  args: { p_settings: Record<string, unknown> }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_metric_defaults", args);
}

export function rpcAdminUpsertGroupMetricSettings(
  client: AppSupabaseClient,
  args: {
    p_group_id: string;
    p_capacity_override: number | null;
    p_capacity_warning_threshold_pct_override: number | null;
    p_healthy_attendance_pct_override: number | null;
    p_manual_health_status_override: string | null;
    p_exclude_from_capacity_metrics: boolean;
    p_admin_metric_notes: string | null;
    p_check_in_due_offset_hours_override: number | null;
    p_allow_over_capacity: boolean;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_upsert_group_metric_settings", args);
}

// Phase 5A.5 reset-to-defaults helper. Takes no arguments; the RPC
// snapshots the current values, restores the baseline, and writes the
// audit row in one transaction.
export function rpcAdminResetMetricDefaults(
  client: AppSupabaseClient
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_reset_metric_defaults", {});
}

export function rpcAdminChangeLeaderRole(
  client: AppSupabaseClient,
  args: { p_profile_id: string; p_new_role: "leader" | "co_leader" }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_change_leader_role", args);
}

// Julian P2: record/upsert a church attendance snapshot by date.
export function rpcAdminRecordChurchAttendanceSnapshot(
  client: AppSupabaseClient,
  args: {
    p_snapshot_date: string;
    p_attendance_count: number;
    p_note: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_record_church_attendance_snapshot", args);
}

// Julian P4: multiplication candidate writes.
export function rpcAdminCreateMultiplicationCandidate(
  client: AppSupabaseClient,
  args: {
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
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_multiplication_candidate", args);
}

export function rpcAdminUpdateMultiplicationCandidate(
  client: AppSupabaseClient,
  args: {
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
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_multiplication_candidate", args);
}

export function rpcAdminArchiveMultiplicationCandidate(
  client: AppSupabaseClient,
  args: { p_candidate_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_multiplication_candidate", args);
}

// Capacity & Multiplication #183: Leader Pipeline (apprentice) writes.
export function rpcAdminCreateApprentice(
  client: AppSupabaseClient,
  args: {
    p_group_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_apprentice", args);
}

export function rpcAdminUpdateApprentice(
  client: AppSupabaseClient,
  args: {
    p_apprentice_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_apprentice", args);
}

export function rpcAdminAdvanceApprenticeStage(
  client: AppSupabaseClient,
  args: { p_apprentice_id: string; p_readiness_stage: LeaderReadinessStage }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_advance_apprentice_stage", args);
}

export function rpcAdminArchiveApprentice(
  client: AppSupabaseClient,
  args: { p_apprentice_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_apprentice", args);
}

// Capacity & Multiplication #185: set a group's target size (effective source).
export function rpcAdminSetGroupCapacityTarget(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_target: number | null }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_group_capacity_target", args);
}

// Phase 5C.0 guest + follow-up admin RPCs.

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

export function rpcAdminCreateGuest(
  client: AppSupabaseClient,
  args: AdminCreateGuestArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_guest", args);
}

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

export function rpcAdminUpdateGuestPipeline(
  client: AppSupabaseClient,
  args: AdminUpdateGuestPipelineArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_guest_pipeline", args);
}

// #375 Interest Funnel: Prospect create + transition. The transition RPC is the
// authoritative funnel gate (legal edges + group-required + joined-archives),
// rejecting with the fixed tokens illegal_transition / group_required /
// missing_prospect. A null p_group_id carries the current group forward.

export function rpcAdminCreateProspect(
  client: AppSupabaseClient,
  args: {
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
    // #399: the DESIRED (top type × category) cell named at intake. Both null
    // when no cell was chosen.
    p_desired_audience_category: GroupAudienceCategory | null;
    p_desired_category_id: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_prospect", args);
}

export function rpcAdminTransitionProspect(
  client: AppSupabaseClient,
  args: {
    p_prospect_id: string;
    p_state: ProspectState;
    p_group_id: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_transition_prospect", args);
}

// Admin UX: edit a Prospect's identity fields (no state change) and soft-archive
// it for cleanup. Both gate on auth_is_admin() in the RPC body and write a
// paired audit_events row; archive sets archived = true so the board drops it.
export function rpcAdminUpdateProspect(
  client: AppSupabaseClient,
  args: {
    p_prospect_id: string;
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_prospect", args);
}

export function rpcAdminArchiveProspect(
  client: AppSupabaseClient,
  args: { p_prospect_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_prospect", args);
}

// #379 pivot slice 7: set a Prospect's single current Next Step (type
// connect_to_group_leader | follow_up + optional due date + detail) and a
// separate Additional Note. The next_step jsonb shape is validated in the
// action layer (validateSetProspectNextStepPayload) and re-validated
// authoritatively in the RPC. No provider is wired — nothing is sent.
export function rpcAdminSetProspectNextStep(
  client: AppSupabaseClient,
  args: {
    p_prospect_id: string;
    p_next_step: Record<string, unknown> | null;
    p_additional_note: string | null;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_prospect_next_step", args);
}

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

export function rpcAdminCreateFollowUp(
  client: AppSupabaseClient,
  args: AdminCreateFollowUpArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_follow_up", args);
}

export type AdminUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: FollowUpStatus;
  p_set_leader_visible_note: boolean;
  p_leader_visible_note: string | null;
  p_set_admin_private_note: boolean;
  p_admin_private_note: string | null;
};

export function rpcAdminUpdateFollowUpStatus(
  client: AppSupabaseClient,
  args: AdminUpdateFollowUpStatusArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_follow_up_status", args);
}

// Phase 5A.6 group calendar admin RPCs.

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

export function rpcAdminCreateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: AdminCreateGroupCalendarEventArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_group_calendar_event", args);
}

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

export function rpcAdminUpdateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: AdminUpdateGroupCalendarEventArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_group_calendar_event", args);
}

export function rpcAdminArchiveGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_group_calendar_event", args);
}

export function rpcAdminRestoreGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_restore_group_calendar_event", args);
}

// Phase 5D.0 shepherd care tracker admin RPCs.

export type AdminUpsertShepherdCareProfileArgs = {
  p_shepherd_profile_id: string;
  p_current_status: ShepherdCareStatus;
  p_set_current_status: boolean;
  p_next_touchpoint_due: string | null;
  p_set_next_touchpoint_due: boolean;
  p_admin_summary: string | null;
  p_set_admin_summary: boolean;
};

export function rpcAdminUpsertShepherdCareProfile(
  client: AppSupabaseClient,
  args: AdminUpsertShepherdCareProfileArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_upsert_shepherd_care_profile", args);
}

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

export function rpcAdminLogShepherdCareInteraction(
  client: AppSupabaseClient,
  args: AdminLogShepherdCareInteractionArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_log_shepherd_care_interaction", args);
}

// Phase SC.1B shepherd care follow-up (task list) admin RPCs.

export type AdminCreateShepherdCareFollowUpArgs = {
  p_care_profile_id: string;
  p_title: string;
  p_due_date: string | null;
  p_notes: string | null;
};

export function rpcAdminCreateShepherdCareFollowUp(
  client: AppSupabaseClient,
  args: AdminCreateShepherdCareFollowUpArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_shepherd_care_follow_up", args);
}

export type AdminUpdateShepherdCareFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_new_status: ShepherdCareFollowUpStatus;
};

export function rpcAdminUpdateShepherdCareFollowUpStatus(
  client: AppSupabaseClient,
  args: AdminUpdateShepherdCareFollowUpStatusArgs
): Promise<RpcResult> {
  return callUuidRpc(
    client,
    "admin_update_shepherd_care_follow_up_status",
    args
  );
}

export type AdminUpdateShepherdCareFollowUpArgs = {
  p_follow_up_id: string;
  p_title: string;
  p_set_due_date: boolean;
  p_due_date: string | null;
  p_set_notes: boolean;
  p_notes: string | null;
};

export function rpcAdminUpdateShepherdCareFollowUp(
  client: AppSupabaseClient,
  args: AdminUpdateShepherdCareFollowUpArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_shepherd_care_follow_up", args);
}

// Admin UX: soft-archive a care follow-up (sets archived_at) so it leaves every
// queue. Status/completed_at are untouched; the RPC writes a paired audit row.
export function rpcAdminArchiveShepherdCareFollowUp(
  client: AppSupabaseClient,
  args: { p_follow_up_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_shepherd_care_follow_up", args);
}

// Phase SC.4 private care notes admin RPCs. The bytea columns travel as base64
// strings (the RPC decodes them); the server only ever holds ciphertext.

export type AdminEnrollPrivateNoteKeysArgs = {
  p_dek_version: number;
  p_slots: Array<Record<string, unknown>>;
};

// Returns the mandatory recovery slot's id (see the migration header deviation).
export function rpcAdminEnrollPrivateNoteKeys(
  client: AppSupabaseClient,
  args: AdminEnrollPrivateNoteKeysArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_enroll_private_note_keys", args);
}

export type AdminUpsertShepherdCarePrivateNoteArgs = {
  p_care_profile_id: string;
  p_ciphertext: string | null;
  p_iv: string | null;
  p_dek_version: number;
  p_set_body: boolean;
};

export function rpcAdminUpsertShepherdCarePrivateNote(
  client: AppSupabaseClient,
  args: AdminUpsertShepherdCarePrivateNoteArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_upsert_shepherd_care_private_note", args);
}

// Phase SC.4 (#113) key-slot lifecycle RPCs. bytea columns travel as base64.

export type AdminAddPrivateNoteKeySlotArgs = {
  p_slot_type: string;
  p_credential_id: string | null;
  p_label: string | null;
  p_prf_salt: string | null;
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
};

export function rpcAdminAddPrivateNoteKeySlot(
  client: AppSupabaseClient,
  args: AdminAddPrivateNoteKeySlotArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_add_private_note_key_slot", args);
}

export type AdminRotatePrivateNoteRecoveryArgs = {
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
  p_label: string | null;
};

export function rpcAdminRotatePrivateNoteRecovery(
  client: AppSupabaseClient,
  args: AdminRotatePrivateNoteRecoveryArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_rotate_private_note_recovery", args);
}

export function rpcAdminRemovePrivateNoteKeySlot(
  client: AppSupabaseClient,
  args: { p_slot_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_remove_private_note_key_slot", args);
}

// Phase 5D.1 over-shepherd coverage tracking admin RPCs.

export type AdminCreateOverShepherdArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
};

export function rpcAdminCreateOverShepherd(
  client: AppSupabaseClient,
  args: AdminCreateOverShepherdArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_over_shepherd", args);
}

export type AdminUpdateOverShepherdArgs = {
  p_over_shepherd_id: string;
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
  p_active: boolean;
};

export function rpcAdminUpdateOverShepherd(
  client: AppSupabaseClient,
  args: AdminUpdateOverShepherdArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_over_shepherd", args);
}

// Admin UX: a focused active toggle so a list/detail "Archive"/"Restore" button
// can soft-archive or restore an over-shepherd without re-sending the whole
// record. Maintains archived_at; writes a paired audit row.
export function rpcAdminSetOverShepherdActive(
  client: AppSupabaseClient,
  args: { p_over_shepherd_id: string; p_active: boolean }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_over_shepherd_active", args);
}

export type AdminAssignShepherdToOverShepherdArgs = {
  p_shepherd_profile_id: string;
  p_over_shepherd_id: string;
  p_assigned_at: string | null;
};

export function rpcAdminAssignShepherdToOverShepherd(
  client: AppSupabaseClient,
  args: AdminAssignShepherdToOverShepherdArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_assign_shepherd_to_over_shepherd", args);
}

export type AdminEndShepherdCoverageAssignmentArgs = {
  p_assignment_id: string;
  p_ended_at: string | null;
};

export function rpcAdminEndShepherdCoverageAssignment(
  client: AppSupabaseClient,
  args: AdminEndShepherdCoverageAssignmentArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_end_shepherd_coverage_assignment", args);
}

// LP.1 launch planning RPC.
export function rpcAdminUpdateLaunchPlanningAssumptions(
  client: AppSupabaseClient,
  args: { p_settings: Record<string, unknown> }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_launch_planning_assumptions", args);
}

// LP.2 launch planning scenario RPCs.

export type AdminCreateLaunchPlanningScenarioArgs = {
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export function rpcAdminCreateLaunchPlanningScenario(
  client: AppSupabaseClient,
  args: AdminCreateLaunchPlanningScenarioArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_launch_planning_scenario", args);
}

export type AdminUpdateLaunchPlanningScenarioArgs = {
  p_scenario_id: string;
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export function rpcAdminUpdateLaunchPlanningScenario(
  client: AppSupabaseClient,
  args: AdminUpdateLaunchPlanningScenarioArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_update_launch_planning_scenario", args);
}

export function rpcAdminArchiveLaunchPlanningScenario(
  client: AppSupabaseClient,
  args: { p_scenario_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_launch_planning_scenario", args);
}

export function rpcAdminSetCurrentLaunchPlanningScenario(
  client: AppSupabaseClient,
  args: { p_scenario_id: string }
): Promise<RpcResult> {
  return callUuidRpc(
    client,
    "admin_set_current_launch_planning_scenario",
    args
  );
}

// #127 group-health tracer: persist a group's monthly attendance dimension +
// computed A-D grade. The rolling-window math is done in TS first
// (lib/admin/group-health.ts); this just writes the already-computed values.
export type AdminUpsertGroupHealthAssessmentArgs = {
  p_group_id: string;
  p_period_month: string;
  p_attendance_pct: number | null;
  p_attendance_weeks_counted: number;
  p_computed_numeric: number | null;
  p_computed_letter: string | null;
};

export function rpcAdminUpsertGroupHealthAssessment(
  client: AppSupabaseClient,
  args: AdminUpsertGroupHealthAssessmentArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_upsert_group_health_assessment", args);
}

// #128 group-health rated dimensions: persist the admin-entered spiritual-growth
// and relayed group-question 1–5 ratings (+ recomputed grade) for a group's
// month. The composite math is done in TS first; the RPC forces the
// group-question leader-reported provenance flag from the score's presence.
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

export function rpcAdminSetGroupHealthRatings(
  client: AppSupabaseClient,
  args: AdminSetGroupHealthRatingsArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_group_health_ratings", args);
}

// #374 / ADR 0018 Health Rubric: upsert the current rubric for a kind
// (group/leader). p_criteria is the validated {key,label,weight} array; the
// weight-to-100 check is done in TS first, the RPC re-guards the JSON shape.
export function rpcAdminSetHealthRubric(
  client: AppSupabaseClient,
  args: {
    p_kind: "group" | "leader";
    p_criteria: Array<Record<string, unknown>>;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_health_rubric", args);
}

// #380 Multiplication Pillars (updated #401): upsert one group type's pillar
// config (thresholds + trigger rubric) for a ministry year. #401 retired the
// fed-capacity payload — capacity is now a derived per-cell issue. The two jsonb
// payloads are validated in TS first; the RPC re-guards their object shape.
export function rpcAdminSetMultiplicationConfig(
  client: AppSupabaseClient,
  args: {
    p_group_type: GroupAudienceCategory;
    p_ministry_year: number;
    p_thresholds: Record<string, unknown>;
    p_trigger: Record<string, unknown>;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_multiplication_config", args);
}

// #402 / PRD §2.4 per-cell readiness rule: upsert the GLOBAL readiness rule for a
// ministry year (interest/capacity/group+leader health in natural units). The rule
// jsonb is validated in TS first; the RPC re-guards its object shape.
export function rpcAdminSetReadinessRule(
  client: AppSupabaseClient,
  args: {
    p_ministry_year: number;
    p_rule: Record<string, unknown>;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_readiness_rule", args);
}

// #402 / PRD §2.4: set a cell's trigger overrides (a partial of the global rule;
// absent pillars inherit). Upserts category_type_targets.trigger_overrides on the
// same (audience_category, category_id) conflict target as the cell apply RPC. An
// empty `{}` clears the cell's overrides back to the global rule.
export function rpcAdminSetCellTriggerOverrides(
  client: AppSupabaseClient,
  args: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_overrides: Record<string, unknown>;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_cell_trigger_overrides", args);
}

// #410 / ADR 0021 per-TYPE readiness rule: upsert the per-type (Audience) rule for
// a ministry year — the MIDDLE tier of the global → per-type → per-cell cascade. A
// partial of the global rule (absent pillars inherit); an empty `{}` clears it back
// to the global rule. The jsonb is validated in TS first; the RPC re-guards shape.
export function rpcAdminSetAudienceReadinessRule(
  client: AppSupabaseClient,
  args: {
    p_ministry_year: number;
    p_audience_category: GroupAudienceCategory;
    p_rule: Record<string, unknown>;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_audience_readiness_rule", args);
}

// #378 / ADR 0018 (pivot slice 5) Leader-Health Grade: upsert a leader's grade
// for a ministry year. The roll-up + override resolution are done in TS first
// (lib/admin/leader-rubric-grade.ts); this persists the already-computed letter
// (+ raw per-criterion scores and any override) through the audited RPC. The
// override letter + scope travel together (both null, or both set).
export type AdminSetLeaderRubricGradeArgs = {
  p_profile_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: "this_month" | "until_cleared" | null;
  p_override_period_month: string | null;
};

export function rpcAdminSetLeaderRubricGrade(
  client: AppSupabaseClient,
  args: AdminSetLeaderRubricGradeArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_leader_rubric_grade", args);
}

// #377 / ADR 0018 Group-Health Grade by rubric: upsert a group's rubric grade
// for a ministry year (per-criterion 0–100 scores + the computed A–F letter +
// an optional letter override under this-month / until-cleared scope). The
// letter is recomputed in TS first via the pure facade
// (lib/admin/group-rubric-grade.ts); the RPC re-validates score range + letters.
export type AdminSetGroupRubricGradeArgs = {
  p_group_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: string | null;
  p_override_period_month: string | null;
};

export function rpcAdminSetGroupRubricGrade(
  client: AppSupabaseClient,
  args: AdminSetGroupRubricGradeArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_group_rubric_grade", args);
}

// Pivot slice 9 (#381 / ADR 0017): author-private Care Notes + Prayer Requests
// + the per-subject transparency toggle. The note/prayer body travels as
// plaintext text; the RPC derives the author server-side and gates authorship on
// the over-shepherd coverage predicate. The transparency toggle is Ministry-
// Admin controlled. DISTINCT from the SC.4 encrypted private care note.

export type AdminWriteCareNoteArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export function rpcAdminWriteCareNote(
  client: AppSupabaseClient,
  args: AdminWriteCareNoteArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_write_care_note", args);
}

export type AdminWritePrayerRequestArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export function rpcAdminWritePrayerRequest(
  client: AppSupabaseClient,
  args: AdminWritePrayerRequestArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_write_prayer_request", args);
}

export type SetNoteTransparencyGrantArgs = {
  p_subject_profile_id: string;
  p_granted: boolean;
};

export function rpcSetNoteTransparencyGrant(
  client: AppSupabaseClient,
  args: SetNoteTransparencyGrantArgs
): Promise<RpcResult> {
  return callUuidRpc(client, "set_note_transparency_grant", args);
}

// #396 Settings > Groups: the group Category catalog + the (top type × category)
// cell matrix. Free-form catalog CRUD (create / rename / archive) and the cell
// apply/unapply, each through an audited SECURITY DEFINER RPC. Archive is the
// reversible soft delete (Archive convention); the cell upsert flips the
// (audience_category × category) row's active flag.

export function rpcAdminCreateGroupCategory(
  client: AppSupabaseClient,
  args: { p_label: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_create_group_category", args);
}

export function rpcAdminRenameGroupCategory(
  client: AppSupabaseClient,
  args: { p_category_id: string; p_label: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_rename_group_category", args);
}

export function rpcAdminArchiveGroupCategory(
  client: AppSupabaseClient,
  args: { p_category_id: string }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_archive_group_category", args);
}

export function rpcAdminSetCategoryTypeCell(
  client: AppSupabaseClient,
  args: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_active: boolean;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_category_type_cell", args);
}

// #400 / PRD §2.3: set a cell's target group count. Upserts the cell row's
// target_count on the same (audience_category, category_id) conflict target as
// the cell apply RPC. Tracking only — does NOT feed the multiply trigger.
export function rpcAdminSetCategoryTypeTargetCount(
  client: AppSupabaseClient,
  args: {
    p_category_id: string;
    p_audience_category: GroupAudienceCategory;
    p_count: number;
  }
): Promise<RpcResult> {
  return callUuidRpc(client, "admin_set_category_type_target_count", args);
}
