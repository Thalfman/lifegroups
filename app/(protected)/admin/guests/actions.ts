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
import {
  rpcAdminCreateGuest,
  rpcAdminUpdateGuestPipeline,
} from "@/lib/admin/rpc";

const REVALIDATE_PATHS = ["/admin/guests", "/admin", "/admin/follow-ups"] as const;

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

const CREATE_GUEST_SPEC: AdminWriteActionSpec<CreateGuestPayload, { id: string }> = {
  name: "admin.guests.create",
  keys: CREATE_GUEST_KEYS,
  validate: validateCreateGuestPayload,
  okFields: (value, id) => ({ new_guest_id: id, pipeline_stage: value.pipeline_stage }),
  rpc: (client, value) =>
    rpcAdminCreateGuest(client, {
      p_full_name: value.full_name,
      p_email: value.email,
      p_phone: value.phone,
      p_first_attended_group_id: value.first_attended_group_id,
      p_first_attended_date: value.first_attended_date,
      p_pipeline_stage: value.pipeline_stage,
      p_assigned_group_id: value.assigned_group_id,
      p_follow_up_owner_id: value.follow_up_owner_id,
      p_notes: value.notes,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The guest wasn't saved. Please try again.",
};

export async function adminCreateGuest(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateGuestPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_GUEST_SPEC, prev, input);
}

// ----- adminUpdateGuestPipeline -------------------------------------------

const UPDATE_GUEST_SPEC: AdminWriteActionSpec<UpdateGuestPipelinePayload, { id: string }> = {
  name: "admin.guests.update_pipeline",
  keys: UPDATE_GUEST_KEYS,
  validate: validateUpdateGuestPipelinePayload,
  fields: (_actor, value) => ({ target_guest_id: value.guest_id }),
  okFields: (value) => ({ pipeline_stage: value.pipeline_stage }),
  rpc: (client, value) =>
    rpcAdminUpdateGuestPipeline(client, {
      p_guest_id: value.guest_id,
      p_pipeline_stage: value.pipeline_stage,
      p_set_assigned_group_id: value.set_assigned_group_id,
      p_assigned_group_id: value.assigned_group_id,
      p_set_follow_up_owner_id: value.set_follow_up_owner_id,
      p_follow_up_owner_id: value.follow_up_owner_id,
      p_set_notes: value.set_notes,
      p_notes: value.notes,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The guest wasn't updated. Please try again.",
};

export async function adminUpdateGuestPipeline(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateGuestPipelinePayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_GUEST_SPEC, prev, input);
}
