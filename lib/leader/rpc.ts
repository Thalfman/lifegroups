// Declarative RPC gateway for the leader surface (the "RPC gateway" half of
// ADR 0001). Mirrors lib/admin/rpc.ts: one typed table keyed by the LITERAL
// Postgres function name, and a generic entry point (`leaderRpc`) that pins
// name + args together at the call site and delegates to `callUuidRpc`, which
// owns the supabase-js cast and the uuid trust-boundary read. See
// `lib/shared/rpc.ts`.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

export type LeaderCheckinStatus =
  | "submitted"
  | "did_not_meet"
  | "planned_pause";
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

// Phase 5C.0 leader follow-up status update.
export type LeaderUpdateFollowUpStatus = "in_progress" | "done";

export type LeaderUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: LeaderUpdateFollowUpStatus;
};

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

// Pivot slice 11 (#382 / ADR 0020): a leader's group-scoped Care Note /
// Prayer Request. Author = the leader; subject = the group. The RPC enforces
// auth_is_leader_of(group) and writes the paired, body-free audit row.
export type LeaderWriteGroupNoteArgs = {
  p_group_id: string;
  p_body: string;
};

// The uuid-channel args map, keyed by the LITERAL Postgres function name.
// Every leader RPC returns a uuid on success.
export type LeaderUuidRpcArgs = {
  leader_submit_group_checkin: LeaderSubmitGroupCheckinArgs;
  leader_update_follow_up_status: LeaderUpdateFollowUpStatusArgs;
  leader_create_group_calendar_event: LeaderCreateGroupCalendarEventArgs;
  leader_update_group_calendar_event: LeaderUpdateGroupCalendarEventArgs;
  leader_archive_group_calendar_event: { p_event_id: string };
  leader_restore_group_calendar_event: { p_event_id: string };
  leader_write_group_care_note: LeaderWriteGroupNoteArgs;
  leader_write_group_prayer_request: LeaderWriteGroupNoteArgs;
};

export function leaderRpc<K extends keyof LeaderUuidRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: LeaderUuidRpcArgs[K]
): Promise<UuidRpcResult> {
  return callUuidRpc(client, name, args);
}
