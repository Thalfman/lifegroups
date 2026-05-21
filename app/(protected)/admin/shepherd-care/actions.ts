"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateAssignShepherdCoveragePayload,
  validateCreateOverShepherdPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateLogShepherdCareInteractionPayload,
  validateUpdateOverShepherdPayload,
  validateUpsertShepherdCareProfilePayload,
  type AssignShepherdCoveragePayload,
  type CreateOverShepherdPayload,
  type EndShepherdCoverageAssignmentPayload,
  type LogShepherdCareInteractionPayload,
  type UpdateOverShepherdPayload,
  type UpsertShepherdCareProfilePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminAssignShepherdToOverShepherd,
  rpcAdminCreateOverShepherd,
  rpcAdminEndShepherdCoverageAssignment,
  rpcAdminLogShepherdCareInteraction,
  rpcAdminUpdateOverShepherd,
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

const CREATE_OVER_SHEPHERD_KEYS = [
  "full_name",
  "email",
  "phone",
  "notes",
] as const;

const UPDATE_OVER_SHEPHERD_KEYS = [
  "over_shepherd_id",
  "full_name",
  "email",
  "phone",
  "notes",
  "active",
] as const;

const ASSIGN_COVERAGE_KEYS = [
  "shepherd_profile_id",
  "over_shepherd_id",
  "assigned_at",
] as const;

const END_COVERAGE_KEYS = ["assignment_id", "ended_at"] as const;

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

// ----- Phase 5D.1 — over-shepherd coverage actions ------------------------

function revalidateOverShepherds(overShepherdId?: string): void {
  revalidatePath("/admin/shepherd-care");
  revalidatePath("/admin/shepherd-care/over-shepherds");
  if (overShepherdId) {
    revalidatePath(`/admin/shepherd-care/over-shepherds/${overShepherdId}`);
  }
}

// ----- adminCreateOverShepherd --------------------------------------------

export async function adminCreateOverShepherd(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateOverShepherdPayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.over_shepherd.create");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, CREATE_OVER_SHEPHERD_KEYS);
  const v = validateCreateOverShepherdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCreateOverShepherd(client, {
    p_full_name: v.value.full_name,
    p_email: v.value.email,
    p_phone: v.value.phone,
    p_notes: v.value.notes,
  });

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
    return actionFail(["The over-shepherd wasn't saved. Please try again."]);
  }

  revalidateOverShepherds();
  ctx.finish("ok", {
    actor_role,
    has_email: v.value.email !== null,
    has_phone: v.value.phone !== null,
    has_notes: v.value.notes !== null,
  });
  return actionOk({ id: data });
}

// ----- adminUpdateOverShepherd --------------------------------------------

export async function adminUpdateOverShepherd(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateOverShepherdPayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.over_shepherd.update");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, UPDATE_OVER_SHEPHERD_KEYS);
  const v = validateUpdateOverShepherdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateOverShepherd(client, {
    p_over_shepherd_id: v.value.over_shepherd_id,
    p_full_name: v.value.full_name,
    p_email: v.value.email,
    p_phone: v.value.phone,
    p_notes: v.value.notes,
    p_active: v.value.active,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_over_shepherd_id: v.value.over_shepherd_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_over_shepherd_id: v.value.over_shepherd_id,
    });
    return actionFail(["The over-shepherd wasn't updated. Please try again."]);
  }

  revalidateOverShepherds(v.value.over_shepherd_id);
  ctx.finish("ok", {
    actor_role,
    target_over_shepherd_id: v.value.over_shepherd_id,
    active: v.value.active,
    has_email: v.value.email !== null,
    has_phone: v.value.phone !== null,
    has_notes: v.value.notes !== null,
  });
  return actionOk({ id: data });
}

// ----- adminAssignShepherdCoverage ----------------------------------------

export async function adminAssignShepherdCoverage(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignShepherdCoveragePayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.shepherd_coverage.assign");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readFromForm(input, ASSIGN_COVERAGE_KEYS);
  const v = validateAssignShepherdCoveragePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminAssignShepherdToOverShepherd(client, {
    p_shepherd_profile_id: v.value.shepherd_profile_id,
    p_over_shepherd_id: v.value.over_shepherd_id,
    p_assigned_at: v.value.assigned_at,
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
    return actionFail(["The coverage assignment wasn't saved. Please try again."]);
  }

  revalidateForProfile(v.value.shepherd_profile_id);
  revalidateOverShepherds(v.value.over_shepherd_id);
  ctx.finish("ok", {
    actor_role,
    target_shepherd_profile_id: v.value.shepherd_profile_id,
    over_shepherd_id: v.value.over_shepherd_id,
  });
  return actionOk({ id: data });
}

// ----- adminEndShepherdCoverage -------------------------------------------

export async function adminEndShepherdCoverage(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EndShepherdCoverageAssignmentPayload>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.shepherd_coverage.end");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  // Forms attach the shepherd_profile_id alongside the assignment id so
  // the action can revalidate the right detail page on success. It is
  // intentionally optional and NOT passed to the RPC — the RPC reads the
  // canonical shepherd_profile_id from the assignment row.
  const raw = readFromForm(input, [
    ...END_COVERAGE_KEYS,
    "shepherd_profile_id",
  ]);
  const v = validateEndShepherdCoverageAssignmentPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminEndShepherdCoverageAssignment(client, {
    p_assignment_id: v.value.assignment_id,
    p_ended_at: v.value.ended_at,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_assignment_id: v.value.assignment_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_assignment_id: v.value.assignment_id,
    });
    return actionFail(["The coverage assignment wasn't ended. Please try again."]);
  }

  const shepherdProfileId =
    typeof raw.shepherd_profile_id === "string"
      ? raw.shepherd_profile_id
      : undefined;
  revalidateForProfile(shepherdProfileId);
  revalidateOverShepherds();
  ctx.finish("ok", {
    actor_role,
    target_assignment_id: v.value.assignment_id,
  });
  return actionOk({ id: data });
}
