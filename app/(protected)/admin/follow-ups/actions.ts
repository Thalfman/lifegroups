"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import {
  validateAdminUpdateFollowUpStatusPayload,
  validateCreateFollowUpPayload,
  type AdminUpdateFollowUpStatusPayload,
  type CreateFollowUpPayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminCreateFollowUp,
  rpcAdminUpdateFollowUpStatus,
} from "@/lib/admin/rpc";

const REVALIDATE_PATHS = [
  "/admin/follow-ups",
  "/admin/guests",
  "/admin",
  "/leader",
] as const;

function revalidateAll(): void {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
}

type ActionInput<T> = T | FormData;

const CREATE_FOLLOW_UP_KEYS = [
  "type",
  "title",
  "related_group_id",
  "related_member_id",
  "related_guest_id",
  "assigned_to",
  "priority",
  "due_date",
  "leader_visible_note",
  "admin_private_note",
] as const;

const UPDATE_STATUS_KEYS = [
  "follow_up_id",
  "status",
  "set_leader_visible_note",
  "leader_visible_note",
  "set_admin_private_note",
  "admin_private_note",
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

// ----- adminCreateFollowUp -----------------------------------------------

export async function adminCreateFollowUp(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateFollowUpPayload>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, CREATE_FOLLOW_UP_KEYS);
  const v = validateCreateFollowUpPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminCreateFollowUp(client, {
    p_type: v.value.type,
    p_title: v.value.title,
    p_related_group_id: v.value.related_group_id,
    p_related_member_id: v.value.related_member_id,
    p_related_guest_id: v.value.related_guest_id,
    p_assigned_to: v.value.assigned_to,
    p_priority: v.value.priority,
    p_due_date: v.value.due_date,
    p_leader_visible_note: v.value.leader_visible_note,
    p_admin_private_note: v.value.admin_private_note,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The follow-up wasn't saved. Please try again."]);

  revalidateAll();
  return actionOk({ id: data });
}

// ----- adminUpdateFollowUpStatus ------------------------------------------

export async function adminUpdateFollowUpStatus(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AdminUpdateFollowUpStatusPayload>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, UPDATE_STATUS_KEYS);
  const v = validateAdminUpdateFollowUpStatusPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminUpdateFollowUpStatus(client, {
    p_follow_up_id: v.value.follow_up_id,
    p_status: v.value.status,
    p_set_leader_visible_note: v.value.set_leader_visible_note,
    p_leader_visible_note: v.value.leader_visible_note,
    p_set_admin_private_note: v.value.set_admin_private_note,
    p_admin_private_note: v.value.admin_private_note,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The status wasn't updated. Please try again."]);

  revalidateAll();
  return actionOk({ id: data });
}
