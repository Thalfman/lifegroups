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
import { leaderRpc } from "@/lib/leader/rpc";
import { readFormPayload } from "@/lib/shared/form-data";

// Pivot slice 11 (#382 / ADR 0020) server actions: a leader's group-scoped
// Care Note + Prayer Request. Both reuse the shared leader write-action runner
// (no service-role key in the Next runtime). The author is the leader; the
// subject is the group. The authorship boundary (the actor must actively lead
// the group) is enforced inside the SECURITY DEFINER RPC via auth_is_leader_of,
// which also writes the paired audit row and NEVER stores the body.

type ActionInput<T> = T | FormData;

const NOT_ASSIGNED =
  "Only the assigned shepherd or co-shepherd can write notes for that group.";

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
  read: readFormPayload,
  validate: validateLeaderGroupCareNotePayload,
  guard: assignedGuard,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (_value, id) => ({ new_care_note_id: id, has_body: true }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_write_group_care_note", {
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
  read: readFormPayload,
  validate: validateLeaderGroupPrayerRequestPayload,
  guard: assignedGuard,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (_value, id) => ({ new_prayer_request_id: id, has_body: true }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_write_group_prayer_request", {
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
