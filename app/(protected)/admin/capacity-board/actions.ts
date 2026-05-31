"use server";

import {
  validateSetGroupCapacityTargetPayload,
  type SetGroupCapacityTargetPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { rpcAdminSetGroupCapacityTarget } from "@/lib/admin/rpc";

// The target feeds capacity status everywhere; revalidate the surfaces that
// read it so a Board edit shows up immediately.
const SET_TARGET_REVALIDATE = [
  "/admin/capacity-board",
  "/admin/launch-planning",
  "/admin/multiplication",
  "/admin",
] as const;

const SET_TARGET_SPEC: AdminWriteActionSpec<
  SetGroupCapacityTargetPayload,
  { id: string }
> = {
  name: "admin.capacity_board.set_group_target",
  read: (input) =>
    input instanceof FormData
      ? {
          group_id: input.get("group_id") ?? undefined,
          // Blank clears the per-group target (falls back to the default).
          target: input.get("target") ?? undefined,
        }
      : (input as Record<string, unknown>),
  validate: validateSetGroupCapacityTargetPayload,
  rpc: (client, value) =>
    rpcAdminSetGroupCapacityTarget(client, {
      p_group_id: value.group_id,
      p_target: value.target,
    }),
  revalidate: () => SET_TARGET_REVALIDATE,
  noDataError: "The target was not saved. Please try again.",
};

export async function adminSetGroupCapacityTarget(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_TARGET_SPEC, prev, input);
}
