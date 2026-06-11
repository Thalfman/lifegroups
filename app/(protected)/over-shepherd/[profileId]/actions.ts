"use server";

import {
  validateOverShepherdBroadNotePayload,
  type OverShepherdBroadNotePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { requireOverShepherdSession } from "@/lib/auth/session";
import { overShepherdRpc } from "@/lib/over-shepherd/rpc";

const LOG_BROAD_NOTE_KEYS = ["shepherd_profile_id", "note"] as const;

// The broad-note write reuses the shared write-action runner (no service-role
// key in the Next runtime) but swaps the auth gate to over_shepherd. The
// coverage boundary itself is enforced in the SECURITY DEFINER RPC
// (auth_over_shepherd_covers), which also writes the paired audit_events row.
const LOG_BROAD_NOTE_SPEC: AdminWriteActionSpec<
  OverShepherdBroadNotePayload,
  { id: string }
> = {
  name: "over_shepherd.log_broad_note",
  keys: LOG_BROAD_NOTE_KEYS,
  validate: validateOverShepherdBroadNotePayload,
  auth: requireOverShepherdSession,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: () => ({ has_note: true }),
  rpc: (client, value) =>
    overShepherdRpc(client, "over_shepherd_log_broad_note", {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_note: value.note,
    }),
  revalidate: (value) => [`/over-shepherd/${value.shepherd_profile_id}`],
  noDataError: "The note wasn't saved. Please try again.",
};

export async function overShepherdLogBroadNote(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<OverShepherdBroadNotePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(LOG_BROAD_NOTE_SPEC, prev, input);
}
