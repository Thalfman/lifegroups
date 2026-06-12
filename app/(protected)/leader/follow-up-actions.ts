"use server";

import {
  validateLeaderUpdateFollowUpStatusPayload,
  type LeaderUpdateFollowUpStatusPayload,
} from "@/lib/admin/validation";
import type { ActionResult } from "@/lib/leader/action-result";
import {
  runLeaderWriteAction,
  type LeaderWriteActionSpec,
} from "@/lib/leader/run-action";
import { leaderRpc, type LeaderUpdateFollowUpStatus } from "@/lib/leader/rpc";

const REVALIDATE_PATHS = ["/leader", "/admin/follow-ups", "/admin"] as const;

function payloadFromInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    return {
      follow_up_id: input.get("follow_up_id") ?? undefined,
      status: input.get("status") ?? undefined,
    };
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

const UPDATE_FOLLOW_UP_STATUS_SPEC: LeaderWriteActionSpec<
  LeaderUpdateFollowUpStatusPayload,
  { id: string }
> = {
  name: "leader.follow_up.update_status",
  read: payloadFromInput,
  validate: validateLeaderUpdateFollowUpStatusPayload,
  fields: (_actor, value) => ({
    target_follow_up_id: value.follow_up_id,
  }),
  okFields: (value) => ({
    new_status: value.status,
  }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_update_follow_up_status", {
      p_follow_up_id: value.follow_up_id,
      p_status: value.status as LeaderUpdateFollowUpStatus,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The follow-up wasn't updated. Please try again.",
};

export async function leaderUpdateFollowUpStatus(
  prev: ActionResult<{ id: string }> | undefined,
  input: FormData | { follow_up_id: string; status: "in_progress" | "done" }
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(UPDATE_FOLLOW_UP_STATUS_SPEC, prev, input);
}
