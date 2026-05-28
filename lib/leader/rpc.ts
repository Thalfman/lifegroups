// Typed wrappers around the leader Postgres RPCs. Each pins the function
// name and argument shape and delegates to `callUuidRpc`, which owns the
// supabase-js `as never` cast and the uuid trust-boundary read. See
// `lib/shared/rpc.ts`.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

type RpcResult = UuidRpcResult;

export type LeaderCheckinStatus = "submitted" | "did_not_meet" | "planned_pause";
export type LeaderHealthPulse = "healthy" | "watch" | "needs_follow_up";
export type LeaderAttendanceStatus = "present" | "absent" | "excused";

export type LeaderAttendanceEntry = {
  member_id: string;
  attendance_status: LeaderAttendanceStatus;
};

export type LeaderSubmitGroupCheckinArgs = {
  p_group_id: string;
  p_meeting_week: string;
  p_meeting_date: string | null;
  p_status: LeaderCheckinStatus;
  p_leader_note: string | null;
  p_pulse: LeaderHealthPulse | null;
  p_follow_up_needed: boolean;
  p_attendance: LeaderAttendanceEntry[];
};

export function rpcLeaderSubmitGroupCheckin(
  client: AppSupabaseClient,
  args: LeaderSubmitGroupCheckinArgs,
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_submit_group_checkin", args);
}

// Phase 5C.0 leader follow-up status update.
export type LeaderUpdateFollowUpStatus = "in_progress" | "done";

export type LeaderUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: LeaderUpdateFollowUpStatus;
};

export function rpcLeaderUpdateFollowUpStatus(
  client: AppSupabaseClient,
  args: LeaderUpdateFollowUpStatusArgs,
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_update_follow_up_status", args);
}

// Phase 5A.6 group calendar leader RPCs.

export type LeaderCreateGroupCalendarEventArgs = {
  p_group_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

export function rpcLeaderCreateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: LeaderCreateGroupCalendarEventArgs,
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_create_group_calendar_event", args);
}

export type LeaderUpdateGroupCalendarEventArgs = {
  p_event_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

export function rpcLeaderUpdateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: LeaderUpdateGroupCalendarEventArgs,
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_update_group_calendar_event", args);
}

export function rpcLeaderArchiveGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_archive_group_calendar_event", args);
}

export function rpcLeaderRestoreGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  return callUuidRpc(client, "leader_restore_group_calendar_event", args);
}
