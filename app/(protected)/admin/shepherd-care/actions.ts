"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateLogShepherdCareInteractionPayload,
  validateUpsertShepherdCareProfilePayload,
  type LogShepherdCareInteractionPayload,
  type UpsertShepherdCareProfilePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminLogShepherdCareInteraction,
  rpcAdminUpsertShepherdCareProfile,
} from "@/lib/admin/rpc";

type ActionInput<T> = T | FormData;

const UPSERT_KEYS = [
  "shepherd_profile_id",
  "set_current_status",
  "current_status",
  "set_next_touchpoint_due",
  "next_touchpoint_due",
  "set_admin_summary",
  "admin_summary",
] as const;

const LOG_INTERACTION_KEYS = [
  "shepherd_profile_id",
  "interaction_at",
  "interaction_type",
  "notes",
  "set_next_touchpoint_due",
  "next_touchpoint_due",
  "set_current_status",
  "current_status",
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

function revalidateForProfile(shepherdProfileId: string | undefined): void {
  revalidatePath("/admin/shepherd-care");
  if (shepherdProfileId) {
    revalidatePath(`/admin/shepherd-care/${shepherdProfileId}`);
  }
}

// ----- adminUpsertShepherdCareProfile -------------------------------------

export async function adminUpsertShepherdCareProfile(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpsertShepherdCareProfilePayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.shepherd_care.upsert_profile");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, UPSERT_KEYS);
  const v = validateUpsertShepherdCareProfilePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpsertShepherdCareProfile(client, {
    p_shepherd_profile_id: v.value.shepherd_profile_id,
    p_current_status: v.value.current_status,
    p_set_current_status: v.value.set_current_status,
    p_next_touchpoint_due: v.value.next_touchpoint_due,
    p_set_next_touchpoint_due: v.value.set_next_touchpoint_due,
    p_admin_summary: v.value.admin_summary,
    p_set_admin_summary: v.value.set_admin_summary,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_shepherd_profile_id: v.value.shepherd_profile_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_shepherd_profile_id: v.value.shepherd_profile_id,
    });
    return actionFail(["The care profile wasn't saved. Please try again."]);
  }

  revalidateForProfile(v.value.shepherd_profile_id);
  ctx.finish("ok", {
    actor_role,
    target_shepherd_profile_id: v.value.shepherd_profile_id,
    status_set: v.value.set_current_status,
    next_touchpoint_set: v.value.set_next_touchpoint_due,
    summary_set: v.value.set_admin_summary,
  });
  return actionOk({ id: data });
}

// ----- adminLogShepherdCareInteraction ------------------------------------

export async function adminLogShepherdCareInteraction(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<LogShepherdCareInteractionPayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.shepherd_care.log_interaction");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, LOG_INTERACTION_KEYS);
  const v = validateLogShepherdCareInteractionPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminLogShepherdCareInteraction(client, {
    p_shepherd_profile_id: v.value.shepherd_profile_id,
    p_interaction_at: v.value.interaction_at,
    p_interaction_type: v.value.interaction_type,
    p_notes: v.value.notes,
    p_set_next_touchpoint_due: v.value.set_next_touchpoint_due,
    p_next_touchpoint_due: v.value.next_touchpoint_due,
    p_set_current_status: v.value.set_current_status,
    p_current_status: v.value.current_status,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_shepherd_profile_id: v.value.shepherd_profile_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_shepherd_profile_id: v.value.shepherd_profile_id,
    });
    return actionFail(["The interaction wasn't saved. Please try again."]);
  }

  revalidateForProfile(v.value.shepherd_profile_id);
  ctx.finish("ok", {
    actor_role,
    target_shepherd_profile_id: v.value.shepherd_profile_id,
    interaction_type: v.value.interaction_type,
    has_notes: v.value.notes !== null,
  });
  return actionOk({ id: data });
}
