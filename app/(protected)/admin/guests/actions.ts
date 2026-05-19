"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import {
  validateCreateGuestPayload,
  validateUpdateGuestPipelinePayload,
  type CreateGuestPayload,
  type UpdateGuestPipelinePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminCreateGuest,
  rpcAdminUpdateGuestPipeline,
} from "@/lib/admin/rpc";

const REVALIDATE_PATHS = ["/admin/guests", "/admin", "/admin/follow-ups"] as const;

function revalidateAll(): void {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
}

type ActionInput<T> = T | FormData;

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

function readFromForm(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const value = input.get(key);
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

// ----- adminCreateGuest ---------------------------------------------------

export async function adminCreateGuest(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateGuestPayload>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, CREATE_GUEST_KEYS);
  const v = validateCreateGuestPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminCreateGuest(client, {
    p_full_name: v.value.full_name,
    p_email: v.value.email,
    p_phone: v.value.phone,
    p_first_attended_group_id: v.value.first_attended_group_id,
    p_first_attended_date: v.value.first_attended_date,
    p_pipeline_stage: v.value.pipeline_stage,
    p_assigned_group_id: v.value.assigned_group_id,
    p_follow_up_owner_id: v.value.follow_up_owner_id,
    p_notes: v.value.notes,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The guest wasn't saved. Please try again."]);

  revalidateAll();
  return actionOk({ id: data });
}

// ----- adminUpdateGuestPipeline -------------------------------------------

export async function adminUpdateGuestPipeline(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateGuestPipelinePayload>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, UPDATE_GUEST_KEYS);
  const v = validateUpdateGuestPipelinePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminUpdateGuestPipeline(client, {
    p_guest_id: v.value.guest_id,
    p_pipeline_stage: v.value.pipeline_stage,
    p_set_assigned_group_id: v.value.set_assigned_group_id,
    p_assigned_group_id: v.value.assigned_group_id,
    p_set_follow_up_owner_id: v.value.set_follow_up_owner_id,
    p_follow_up_owner_id: v.value.follow_up_owner_id,
    p_set_notes: v.value.set_notes,
    p_notes: v.value.notes,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The guest wasn't updated. Please try again."]);

  revalidateAll();
  return actionOk({ id: data });
}
