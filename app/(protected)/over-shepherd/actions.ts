"use server";

import {
  validateOverShepherdLogInteractionPayload,
  type OverShepherdLogInteractionPayload,
} from "@/lib/over-shepherd/validation";
import { type ActionResult } from "@/lib/over-shepherd/action-result";
import {
  runOverShepherdWriteAction,
  type ActionInput,
  type OverShepherdWriteActionSpec,
} from "@/lib/over-shepherd/run-action";
import { rpcOverShepherdLogCareInteraction } from "@/lib/over-shepherd/rpc";

const LOG_INTERACTION_KEYS = [
  "shepherd_profile_id",
  "interaction_at",
  "interaction_type",
  "notes",
] as const;

const LOG_INTERACTION_SPEC: OverShepherdWriteActionSpec<
  OverShepherdLogInteractionPayload,
  { id: string }
> = {
  name: "over_shepherd.care.log_interaction",
  keys: LOG_INTERACTION_KEYS,
  validate: validateOverShepherdLogInteractionPayload,
  targetShepherdId: (value) => value.shepherd_profile_id,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: (value) => ({
    interaction_type: value.interaction_type,
    // Presence flag only — never the note body (mirrors the audit row).
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    rpcOverShepherdLogCareInteraction(client, {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_interaction_at: value.interaction_at,
      p_interaction_type: value.interaction_type,
      p_notes: value.notes,
    }),
  revalidate: (value) => [
    "/over-shepherd",
    `/over-shepherd/${value.shepherd_profile_id}`,
  ],
  noDataError: "The interaction wasn't saved. Please try again.",
};

export async function overShepherdLogCareInteraction(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<OverShepherdLogInteractionPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runOverShepherdWriteAction(LOG_INTERACTION_SPEC, prev, input);
}
