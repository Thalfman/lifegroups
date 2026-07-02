"use server";

import {
  validateCreateGuestPayload,
  validateUpdateGuestPipelinePayload,
  type CreateGuestPayload,
  type UpdateGuestPipelinePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

const REVALIDATE_PATHS = [
  "/admin/guests",
  "/admin",
  "/admin/follow-ups",
] as const;

// Both form-key lists double as toRpcArgs key lists: the RPC args are exactly
// these fields, p_-prefixed (checked against the Args types at the adminRpc
// call sites).
const CREATE_GUEST_KEYS = [
  "full_name",
  "email",
  "phone",
  "first_attended_group_id",
  "first_attended_date",
  "pipeline_stage",
  "assigned_group_id",
  "follow_up_owner_id",
  "notes",
] as const;

const UPDATE_GUEST_KEYS = [
  "guest_id",
  "pipeline_stage",
  "set_assigned_group_id",
  "assigned_group_id",
  "set_follow_up_owner_id",
  "follow_up_owner_id",
  "set_notes",
  "notes",
] as const;

// ----- adminCreateGuest ---------------------------------------------------

const CREATE_GUEST_SPEC: AdminWriteActionSpec<
  CreateGuestPayload,
  { id: string }
> = {
  name: "admin.guests.create",
  keys: CREATE_GUEST_KEYS,
  validate: validateCreateGuestPayload,
  okFields: (value, id) => ({
    new_guest_id: id,
    pipeline_stage: value.pipeline_stage,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_create_guest", toRpcArgs(value, CREATE_GUEST_KEYS)),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The guest wasn't saved. Please try again.",
};

export async function adminCreateGuest(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateGuestPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_GUEST_SPEC, prev, input);
}

// ----- adminUpdateGuestPipeline -------------------------------------------

const UPDATE_GUEST_SPEC: AdminWriteActionSpec<
  UpdateGuestPipelinePayload,
  { id: string }
> = {
  name: "admin.guests.update_pipeline",
  keys: UPDATE_GUEST_KEYS,
  validate: validateUpdateGuestPipelinePayload,
  fields: (_actor, value) => ({ target_guest_id: value.guest_id }),
  okFields: (value) => ({ pipeline_stage: value.pipeline_stage }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_guest_pipeline",
      toRpcArgs(value, UPDATE_GUEST_KEYS)
    ),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The guest wasn't updated. Please try again.",
};

export async function adminUpdateGuestPipeline(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateGuestPipelinePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_GUEST_SPEC, prev, input);
}
