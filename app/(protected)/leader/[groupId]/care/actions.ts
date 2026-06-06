"use server";

import {
  validateLeaderGroupCareNotePayload,
  validateLeaderGroupPrayerRequestPayload,
  type LeaderGroupNotePayload,
} from "@/lib/leader/group-note-validation";
import { type ActionResult } from "@/lib/leader/action-result";
import {
  runLeaderWriteAction,
  type LeaderWriteActionSpec,
} from "@/lib/leader/run-action";
import {
  rpcLeaderWriteGroupCareNote,
  rpcLeaderWriteGroupPrayerRequest,
} from "@/lib/leader/rpc";

// Pivot slice 11 (#382 / ADR 0020) server actions: a leader's group-scoped
// Care Note + Prayer Request. Both reuse the shared leader write-action runner
// (no service-role key in the Next runtime). The author is the leader; the
// subject is the group. The authorship boundary (the actor must actively lead
// the group) is enforced inside the SECURITY DEFINER RPC via auth_is_leader_of,
// which also writes the paired audit row and NEVER stores the body.

type ActionInput<T> = T | FormData;

const NOT_ASSIGNED =
  "Only the assigned leader or co-leader can write notes for that group.";

function payloadFromInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = typeof value === "string" ? value : undefined;
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function leaderCarePaths(groupId: string): string[] {
  return [`/leader/${groupId}/care`, "/leader"];
}

// Defense-in-depth: the RPC also enforces auth_is_leader_of(group_id), but
// rejecting locally avoids surfacing a generic insufficient_privilege error to
// a leader who tampered with the form's hidden group_id field.
function assignedGuard(
  actor: { assignedGroupIds: string[] },
  value: LeaderGroupNotePayload
) {
  return actor.assignedGroupIds.includes(value.group_id)
    ? null
    : {
        error: NOT_ASSIGNED,
        code: "not_assigned",
        fields: { target_group_id: value.group_id },
      };
}

// ----- leaderWriteGroupCareNote -------------------------------------------

const CARE_NOTE_SPEC: LeaderWriteActionSpec<
  LeaderGroupNotePayload,
  { id: string }
> = {
  name: "leader.care_note.write",
  read: payloadFromInput,
  validate: validateLeaderGroupCareNotePayload,
  guard: assignedGuard,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (_value, id) => ({ new_care_note_id: id, has_body: true }),
  rpc: (client, value) =>
    rpcLeaderWriteGroupCareNote(client, {
      p_group_id: value.group_id,
      p_body: value.body,
    }),
  revalidate: (value) => leaderCarePaths(value.group_id),
  noDataError: "The care note wasn't saved. Please try again.",
};

export async function leaderWriteGroupCareNote(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(CARE_NOTE_SPEC, prev, input);
}

// ----- leaderWriteGroupPrayerRequest --------------------------------------

const PRAYER_REQUEST_SPEC: LeaderWriteActionSpec<
  LeaderGroupNotePayload,
  { id: string }
> = {
  name: "leader.prayer_request.write",
  read: payloadFromInput,
  validate: validateLeaderGroupPrayerRequestPayload,
  guard: assignedGuard,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (_value, id) => ({ new_prayer_request_id: id, has_body: true }),
  rpc: (client, value) =>
    rpcLeaderWriteGroupPrayerRequest(client, {
      p_group_id: value.group_id,
      p_body: value.body,
    }),
  revalidate: (value) => leaderCarePaths(value.group_id),
  noDataError: "The prayer request wasn't saved. Please try again.",
};

export async function leaderWriteGroupPrayerRequest(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(PRAYER_REQUEST_SPEC, prev, input);
}
