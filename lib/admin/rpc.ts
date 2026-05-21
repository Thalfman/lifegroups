// Typed wrappers around the Phase 5A.1 admin Postgres RPCs. The
// @supabase/supabase-js `.rpc()` generic resolution chokes when the
// Database type doesn't structurally match its internal GenericSchema
// (which our hand-rolled Database type doesn't, in subtle ways that
// don't affect `.from()` calls). Rather than rewrite the entire
// database typing surface, we wrap each RPC in a tiny typed helper
// and pass the args via a single `as never` cast at the boundary.
//
// Each helper:
//   * accepts the exact param types we need.
//   * returns a tuple of `{ data, error }` shape (data is the RPC's
//     uuid return value or null on failure; error is whatever
//     PostgrestError surfaced).
//   * does no validation of its own — the action layer validates first.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GroupCalendarEventStatus,
  GroupCalendarEventType,
  GuestPipelineStage,
  MeetingFrequency,
  MeetingWeekParity,
  RoleInGroup,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
  UserRole,
} from "@/types/enums";
import { readUuidRpcData } from "./rpc-helpers";

type RpcResult = { data: string | null; error: { message: string } | null };

export async function rpcAdminCreateLeaderProfile(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string; p_phone: string | null },
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_leader_profile" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminCreateMember(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string | null; p_phone: string | null },
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_member" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminAssignLeaderToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_profile_id: string; p_role: RoleInGroup },
): Promise<RpcResult> {
  const r = await client.rpc("admin_assign_leader_to_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminAssignMemberToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_member_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_assign_member_to_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminDeactivateProfile(
  client: AppSupabaseClient,
  args: { p_profile_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_deactivate_profile" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminDeactivateMember(
  client: AppSupabaseClient,
  args: { p_member_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_deactivate_member" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
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
};

export async function rpcAdminCreateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminUpdateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs & { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminCloseGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_close_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminReopenGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_reopen_group" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Phase 5A.3 super admin role management RPC.

export async function rpcSuperAdminUpdateProfileRole(
  client: AppSupabaseClient,
  args: { p_profile_id: string; p_new_role: UserRole },
): Promise<RpcResult> {
  const r = await client.rpc("super_admin_update_profile_role" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Phase 5A.4 admin settings + leader-role-swap RPCs.

export async function rpcAdminUpdateMetricDefaults(
  client: AppSupabaseClient,
  args: { p_settings: Record<string, unknown> },
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_metric_defaults" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminUpsertGroupMetricSettings(
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
  },
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_upsert_group_metric_settings" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Phase 5A.5 reset-to-defaults helper. Takes no arguments; the RPC
// snapshots the current values, restores the baseline, and writes the
// audit row in one transaction.
export async function rpcAdminResetMetricDefaults(
  client: AppSupabaseClient,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_reset_metric_defaults" as never,
    {} as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminChangeLeaderRole(
  client: AppSupabaseClient,
  args: { p_profile_id: string; p_new_role: "leader" | "co_leader" },
): Promise<RpcResult> {
  const r = await client.rpc("admin_change_leader_role" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminCreateGuest(
  client: AppSupabaseClient,
  args: AdminCreateGuestArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_guest" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminUpdateGuestPipeline(
  client: AppSupabaseClient,
  args: AdminUpdateGuestPipelineArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_guest_pipeline" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminCreateFollowUp(
  client: AppSupabaseClient,
  args: AdminCreateFollowUpArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_follow_up" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export type AdminUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: FollowUpStatus;
  p_set_leader_visible_note: boolean;
  p_leader_visible_note: string | null;
  p_set_admin_private_note: boolean;
  p_admin_private_note: string | null;
};

export async function rpcAdminUpdateFollowUpStatus(
  client: AppSupabaseClient,
  args: AdminUpdateFollowUpStatusArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_follow_up_status" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminCreateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: AdminCreateGroupCalendarEventArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_create_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminUpdateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: AdminUpdateGroupCalendarEventArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_update_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminArchiveGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_archive_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcAdminRestoreGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_restore_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminUpsertShepherdCareProfile(
  client: AppSupabaseClient,
  args: AdminUpsertShepherdCareProfileArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_upsert_shepherd_care_profile" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcAdminLogShepherdCareInteraction(
  client: AppSupabaseClient,
  args: AdminLogShepherdCareInteractionArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_log_shepherd_care_interaction" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Phase 5D.1 over-shepherd coverage tracking admin RPCs.

export type AdminCreateOverShepherdArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
};

export async function rpcAdminCreateOverShepherd(
  client: AppSupabaseClient,
  args: AdminCreateOverShepherdArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_over_shepherd" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export type AdminUpdateOverShepherdArgs = {
  p_over_shepherd_id: string;
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
  p_active: boolean;
};

export async function rpcAdminUpdateOverShepherd(
  client: AppSupabaseClient,
  args: AdminUpdateOverShepherdArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_over_shepherd" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

export type AdminAssignShepherdToOverShepherdArgs = {
  p_shepherd_profile_id: string;
  p_over_shepherd_id: string;
  p_assigned_at: string | null;
};

export async function rpcAdminAssignShepherdToOverShepherd(
  client: AppSupabaseClient,
  args: AdminAssignShepherdToOverShepherdArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_assign_shepherd_to_over_shepherd" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export type AdminEndShepherdCoverageAssignmentArgs = {
  p_assignment_id: string;
  p_ended_at: string | null;
};

export async function rpcAdminEndShepherdCoverageAssignment(
  client: AppSupabaseClient,
  args: AdminEndShepherdCoverageAssignmentArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "admin_end_shepherd_coverage_assignment" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}
