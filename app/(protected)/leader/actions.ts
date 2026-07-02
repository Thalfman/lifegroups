"use server";

import { redirect } from "next/navigation";
import {
  validateLeaderCheckinPayload,
  type LeaderCheckinPayload,
} from "@/lib/leader/validation";
import { isoWeekStart } from "@/lib/shared/church-time";
import { type ActionResult, actionFail } from "@/lib/leader/action-result";
import {
  runLeaderWriteAction,
  type LeaderWriteActionSpec,
} from "@/lib/leader/run-action";
import { leaderRpc } from "@/lib/leader/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";
import { readFrozenSurfaceFlagForLeader } from "@/lib/auth/leader-surface-flag";

// toRpcArgs key list shared by both check-in specs: the RPC args are exactly
// these payload fields, p_-prefixed (checked against
// LeaderSubmitGroupCheckinArgs at the leaderRpc call sites).
const CHECKIN_ARG_KEYS = [
  "group_id",
  "meeting_week",
  "meeting_date",
  "status",
  "leader_note",
  "pulse",
  "follow_up_needed",
  "attendance",
] as const;

const REVALIDATE_LEADER = "/leader";

const CHECKIN_NOT_ASSIGNED =
  "Only an assigned shepherd or co-shepherd can submit this check-in.";

const CHECKINS_FROZEN = "Weekly check-ins aren't available right now.";

// Check-ins stay FROZEN, DECOUPLED from leader_surface (#376 criterion 2). The
// leader_submit_group_checkin RPC writes attendance + group_health_updates and
// must NOT re-open just because leader_surface is live — it carries its OWN
// `check_ins` frozen gate (ADR 0002 / 0009), which stays off this slice. Every
// check-in action calls this before reaching requireLeaderActor / the RPC, so a
// leader with a live leader_surface still cannot submit a check-in. Read through
// the leader-safe RPC; fails closed.
async function checkInsFrozenGate(): Promise<LeaderCheckinActionResult | null> {
  const live = await readFrozenSurfaceFlagForLeader("check_ins");
  if (live) return null;
  return actionFail([CHECKINS_FROZEN]);
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
// asserts the caller is a leader-role profile assigned to the group, and
// calls the SECURITY DEFINER RPC `leader_submit_group_checkin`. The RPC
// re-checks all of these at the database boundary; this action layer just
// surfaces friendly text and avoids round-tripping when we can already see
// the call would be rejected.
const SUBMIT_CHECKIN_SPEC: LeaderWriteActionSpec<
  LeaderCheckinPayload,
  { session_id: string }
> = {
  name: "leader.checkin.submit",
  read: payloadFromInput,
  validate: validateLeaderCheckinPayload,
  // Defense-in-depth: refuse to hit the RPC if the leader isn't assigned to
  // the group. The RPC also rejects with not_leader_of_group; bailing here
  // saves a round trip.
  guard: (actor, value) =>
    actor.assignedGroupIds.includes(value.group_id)
      ? null
      : {
          error: CHECKIN_NOT_ASSIGNED,
          code: "not_assigned",
          fields: { target_group_id: value.group_id },
        },
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (value, id) => ({
    checkin_status: value.status,
    new_session_id: id,
  }),
  rpc: (client, value) =>
    leaderRpc(
      client,
      "leader_submit_group_checkin",
      toRpcArgs(value, CHECKIN_ARG_KEYS)
    ),
  revalidate: (value) => [
    REVALIDATE_LEADER,
    `/leader/${value.group_id}/checkin`,
  ],
  result: (id) => ({ session_id: id }),
  noDataError: "The check-in didn't save. Please try again.",
};

export async function leaderSubmitGroupCheckin(
  prev: LeaderCheckinActionResult | undefined,
  input: FormData | Record<string, unknown>
): Promise<LeaderCheckinActionResult> {
  const frozen = await checkInsFrozenGate();
  if (frozen) return frozen;
  return runLeaderWriteAction(SUBMIT_CHECKIN_SPEC, prev, input);
}

// ---------------------------------------------------------------------------
// leaderQuickMarkDidNotMeet
// ---------------------------------------------------------------------------
// Convenience action invoked from the dashboard card so a leader can record
// "we didn't meet this week" in one tap, with no attendance list. The
// server picks the current Monday-of-week as `meeting_week` so the leader
// never has to think about dates.
const QUICK_DID_NOT_MEET_SPEC: LeaderWriteActionSpec<
  LeaderCheckinPayload,
  { session_id: string }
> = {
  name: "leader.checkin.quick_did_not_meet",
  read: (input) => {
    const groupId =
      input instanceof FormData
        ? (input.get("group_id") ?? undefined)
        : (input as { group_id?: string } | null)?.group_id;
    return {
      group_id: groupId,
      meeting_week: isoWeekStart(new Date()),
      meeting_date: null,
      status: "did_not_meet",
      leader_note: null,
      pulse: null,
      follow_up_needed: false,
      attendance: [],
    };
  },
  validate: validateLeaderCheckinPayload,
  guard: (actor, value) =>
    actor.assignedGroupIds.includes(value.group_id)
      ? null
      : {
          error: CHECKIN_NOT_ASSIGNED,
          code: "not_assigned",
          fields: { target_group_id: value.group_id },
        },
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (_value, id) => ({ new_session_id: id }),
  rpc: (client, value) =>
    leaderRpc(
      client,
      "leader_submit_group_checkin",
      toRpcArgs(value, CHECKIN_ARG_KEYS)
    ),
  revalidate: () => [REVALIDATE_LEADER],
  result: (id) => ({ session_id: id }),
  noDataError: "The check-in didn't save. Please try again.",
};

export async function leaderQuickMarkDidNotMeet(
  prev: LeaderCheckinActionResult | undefined,
  input: FormData | { group_id?: string }
): Promise<LeaderCheckinActionResult> {
  const frozen = await checkInsFrozenGate();
  if (frozen) return frozen;
  return runLeaderWriteAction(QUICK_DID_NOT_MEET_SPEC, prev, input);
}

// ---------------------------------------------------------------------------
// leaderSubmitCheckinAndReturn
// ---------------------------------------------------------------------------
// Thin wrapper used by the standalone check-in page. On success it
// redirects back to /leader so the dashboard reflects the new state; on
// failure the form re-renders with the error list. Stays hand-written
// because it redirects after delegating.
export async function leaderSubmitCheckinAndReturn(
  _prev: LeaderCheckinActionResult | undefined,
  formData: FormData
): Promise<LeaderCheckinActionResult> {
  const result = await leaderSubmitGroupCheckin(undefined, formData);
  if (!result.ok) return result;
  redirect("/leader?checkin=saved");
}
