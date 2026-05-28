// Typed wrapper around the Phase 5B.0 leader_submit_group_checkin
// Postgres RPC. Same pattern as `lib/admin/rpc.ts` -- supabase-js'
// `.rpc()` generic resolution doesn't agree with our hand-rolled
// Database type, so the wrapper hides the `as never` cast.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";
import { readUuidRpcData } from "@/lib/shared/uuid";

type RpcResult = { data: string | null; error: { message: string } | null };

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

export async function rpcLeaderSubmitGroupCheckin(
  client: AppSupabaseClient,
  args: LeaderSubmitGroupCheckinArgs,
): Promise<RpcResult> {
  const r = await client.rpc("leader_submit_group_checkin" as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Phase 5C.0 leader follow-up status update.
export type LeaderUpdateFollowUpStatus = "in_progress" | "done";

export type LeaderUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: LeaderUpdateFollowUpStatus;
};

export async function rpcLeaderUpdateFollowUpStatus(
  client: AppSupabaseClient,
  args: LeaderUpdateFollowUpStatusArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "leader_update_follow_up_status" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcLeaderCreateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: LeaderCreateGroupCalendarEventArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "leader_create_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
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

export async function rpcLeaderUpdateGroupCalendarEvent(
  client: AppSupabaseClient,
  args: LeaderUpdateGroupCalendarEventArgs,
): Promise<RpcResult> {
  const r = await client.rpc(
    "leader_update_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcLeaderArchiveGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  const r = await client.rpc(
    "leader_archive_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}

export async function rpcLeaderRestoreGroupCalendarEvent(
  client: AppSupabaseClient,
  args: { p_event_id: string },
): Promise<RpcResult> {
  const r = await client.rpc(
    "leader_restore_group_calendar_event" as never,
    args as never,
  );
  return { data: readUuidRpcData(r.data), error: r.error };
}
