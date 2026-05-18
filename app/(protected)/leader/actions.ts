"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isLeaderRole } from "@/lib/auth/roles";
import {
  validateLeaderCheckinPayload,
  isoWeekStart,
} from "@/lib/leader/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/leader/action-result";
import { rpcLeaderSubmitGroupCheckin } from "@/lib/leader/rpc";

const REVALIDATE_LEADER = "/leader";

async function requireLeaderActor(): Promise<
  | { ok: true; profileId: string; assignedGroupIds: string[] }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in to do that." };
  if (!session.profile) return { ok: false, error: "Your account isn't set up yet." };
  if (session.profile.status !== "active")
    return { ok: false, error: "Your account isn't active." };
  // Admins who haven't been explicitly assigned as a leader of the
  // target group are routed through admin tools instead. The Phase 5B.0
  // workflow is for *leaders* (or co-leaders) actually doing the
  // weekly check-in.
  if (!isLeaderRole(session.profile.role))
    return {
      ok: false,
      error: "Only an assigned leader or co-leader can submit this check-in.",
    };
  return {
    ok: true,
    profileId: session.profile.id,
    assignedGroupIds: session.assignedGroupIds,
  };
}

function parseAttendanceFormField(raw: FormDataEntryValue | null): unknown {
  if (raw === null) return [];
  if (typeof raw !== "string") return [];
  if (raw.trim().length === 0) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // let validation reject with a friendlier message
  }
}

function payloadFromInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    return {
      group_id: input.get("group_id") ?? undefined,
      meeting_week: input.get("meeting_week") ?? undefined,
      meeting_date: input.get("meeting_date") ?? undefined,
      status: input.get("status") ?? undefined,
      leader_note: input.get("leader_note") ?? undefined,
      pulse: input.get("pulse") ?? undefined,
      follow_up_needed: input.get("follow_up_needed") ?? undefined,
      attendance: parseAttendanceFormField(input.get("attendance")),
    };
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export type LeaderCheckinActionResult = ActionResult<{ session_id: string }>;

// ---------------------------------------------------------------------------
// leaderSubmitGroupCheckin
// ---------------------------------------------------------------------------
// Used by the leader check-in form (Phase 5B.0). Validates the payload,
// asserts the caller is a leader-role profile, and calls the SECURITY
// DEFINER RPC `leader_submit_group_checkin`. The RPC re-checks all of
// these conditions at the database boundary; this action layer just
// surfaces friendly text and avoids round-tripping when we can already
// see the call would be rejected.
export async function leaderSubmitGroupCheckin(
  _prev: LeaderCheckinActionResult | undefined,
  input: FormData | Record<string, unknown>,
): Promise<LeaderCheckinActionResult> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateLeaderCheckinPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  // Defense-in-depth: refuse to even hit the RPC if the leader isn't
  // assigned to the group they're submitting for. The RPC will also
  // reject with not_leader_of_group, but bailing here saves a round trip.
  if (!auth.assignedGroupIds.includes(v.value.group_id)) {
    return actionFail([
      "Only an assigned leader or co-leader can submit this check-in.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderSubmitGroupCheckin(client, {
    p_group_id: v.value.group_id,
    p_meeting_week: v.value.meeting_week,
    p_meeting_date: v.value.meeting_date,
    p_status: v.value.status,
    p_leader_note: v.value.leader_note,
    p_pulse: v.value.pulse,
    p_follow_up_needed: v.value.follow_up_needed,
    p_attendance: v.value.attendance,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The check-in didn't save. Please try again."]);

  revalidatePath(REVALIDATE_LEADER);
  revalidatePath(`/leader/${v.value.group_id}/checkin`);
  return actionOk({ session_id: data });
}

// ---------------------------------------------------------------------------
// leaderQuickMarkDidNotMeet
// ---------------------------------------------------------------------------
// Convenience action invoked from the dashboard card so a leader can
// record "we didn't meet this week" in one tap, with no attendance
// list. The server picks the current Monday-of-week as `meeting_week`
// so the leader never has to think about dates.
export async function leaderQuickMarkDidNotMeet(
  _prev: LeaderCheckinActionResult | undefined,
  input: FormData | { group_id?: string },
): Promise<LeaderCheckinActionResult> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const groupId =
    input instanceof FormData
      ? (input.get("group_id") ?? undefined)
      : input.group_id;
  const meetingWeek = isoWeekStart(new Date());

  const v = validateLeaderCheckinPayload({
    group_id: groupId,
    meeting_week: meetingWeek,
    meeting_date: null,
    status: "did_not_meet",
    leader_note: null,
    pulse: null,
    follow_up_needed: false,
    attendance: [],
  });
  if (!v.ok) return actionFail(v.errors);

  if (!auth.assignedGroupIds.includes(v.value.group_id)) {
    return actionFail([
      "Only an assigned leader or co-leader can submit this check-in.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderSubmitGroupCheckin(client, {
    p_group_id: v.value.group_id,
    p_meeting_week: v.value.meeting_week,
    p_meeting_date: v.value.meeting_date,
    p_status: "did_not_meet",
    p_leader_note: v.value.leader_note,
    p_pulse: v.value.pulse,
    p_follow_up_needed: v.value.follow_up_needed,
    p_attendance: v.value.attendance,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The check-in didn't save. Please try again."]);

  revalidatePath(REVALIDATE_LEADER);
  return actionOk({ session_id: data });
}

// ---------------------------------------------------------------------------
// leaderSubmitCheckinAndReturn
// ---------------------------------------------------------------------------
// Thin wrapper used by the standalone check-in page. On success it
// redirects back to /leader so the dashboard reflects the new state;
// on failure the form re-renders with the error list.
export async function leaderSubmitCheckinAndReturn(
  _prev: LeaderCheckinActionResult | undefined,
  formData: FormData,
): Promise<LeaderCheckinActionResult> {
  const result = await leaderSubmitGroupCheckin(undefined, formData);
  if (!result.ok) return result;
  redirect("/leader?checkin=saved");
}
