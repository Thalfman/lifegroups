// Typed wrapper around the Phase 5B.0 leader_submit_group_checkin
// Postgres RPC. Same pattern as `lib/admin/rpc.ts` -- supabase-js'
// `.rpc()` generic resolution doesn't agree with our hand-rolled
// Database type, so the wrapper hides the `as never` cast.

import type { AppSupabaseClient } from "@/lib/supabase/types";

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
  return { data: (r.data as string | null) ?? null, error: r.error };
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
  return { data: (r.data as string | null) ?? null, error: r.error };
}
