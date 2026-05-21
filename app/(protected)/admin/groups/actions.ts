"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateCreateGroupPayload,
  validateUpdateGroupPayload,
  validateGroupIdPayload,
  type GroupWritablePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminCloseGroup,
  rpcAdminCreateGroup,
  rpcAdminReopenGroup,
  rpcAdminUpdateGroup,
  type GroupRpcArgs,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/groups";

const GROUP_KEYS = [
  "name",
  "description",
  "meeting_day",
  "meeting_time",
  "meeting_frequency",
  "meeting_week_parity",
  "location_area",
  "address_optional",
  "capacity",
] as const;

function readFromForm(input: unknown, keys: readonly string[]): Record<string, unknown> {
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

type ActionInput<T> = T | FormData;

function payloadToRpcArgs(payload: GroupWritablePayload): GroupRpcArgs {
  return {
    p_name: payload.name,
    p_description: payload.description ?? null,
    p_meeting_day: payload.meeting_day ?? null,
    p_meeting_time: payload.meeting_time ?? null,
    p_location_area: payload.location_area ?? null,
    p_address_optional: payload.address_optional ?? null,
    p_capacity: payload.capacity ?? null,
    p_meeting_frequency: payload.meeting_frequency,
    p_meeting_week_parity: payload.meeting_week_parity,
  };
}

// ----- adminCreateGroup ----------------------------------------------------

export async function adminCreateGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupWritablePayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.groups.create");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, GROUP_KEYS);
  const v = validateCreateGroupPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCreateGroup(client, payloadToRpcArgs(v.value));

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role });
    return actionFail(["The group was not created. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  ctx.finish("ok", { actor_role, new_group_id: data });
  return actionOk({ id: data });
}

// ----- adminUpdateGroup ----------------------------------------------------

const UPDATE_GROUP_KEYS = ["group_id", ...GROUP_KEYS] as const;

export async function adminUpdateGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupWritablePayload & { group_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.groups.update");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, UPDATE_GROUP_KEYS);
  const v = validateUpdateGroupPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateGroup(client, {
    p_group_id: v.value.group_id,
    ...payloadToRpcArgs(v.value),
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail(["The group was not updated. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  ctx.finish("ok", { actor_role, target_group_id: v.value.group_id });
  return actionOk({ id: data });
}

// ----- adminCloseGroup -----------------------------------------------------

const GROUP_ID_KEYS = ["group_id"] as const;

export async function adminCloseGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ group_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.groups.close");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, GROUP_ID_KEYS);
  const v = validateGroupIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCloseGroup(client, {
    p_group_id: v.value.group_id,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail(["The group was not closed. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  ctx.finish("ok", { actor_role, target_group_id: v.value.group_id });
  return actionOk({ id: data });
}

// ----- adminReopenGroup ----------------------------------------------------

export async function adminReopenGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ group_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.groups.reopen");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, GROUP_ID_KEYS);
  const v = validateGroupIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminReopenGroup(client, {
    p_group_id: v.value.group_id,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail(["The group was not reopened. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  ctx.finish("ok", { actor_role, target_group_id: v.value.group_id });
  return actionOk({ id: data });
}
