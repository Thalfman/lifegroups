"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateCreateLaunchPlanningScenarioPayload,
  validateScenarioIdPayload,
  validateUpdateLaunchPlanningScenarioPayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminArchiveLaunchPlanningScenario,
  rpcAdminCreateLaunchPlanningScenario,
  rpcAdminSetCurrentLaunchPlanningScenario,
  rpcAdminUpdateLaunchPlanningScenario,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_ADMIN = "/admin";

// Mirrors the LP.1 assumption form fields so the scenario create / edit
// form can POST with the same input names. Numeric fields are passed as
// strings — the validator's number readers accept either form. Empty
// strings collapse to defaults for numbers; nullable string fields treat
// "" as an explicit null clear.
const SCENARIO_ASSUMPTION_FIELDS = [
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
] as const;

function readScenarioAssumptionsFromForm(
  form: FormData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SCENARIO_ASSUMPTION_FIELDS) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (value === null) continue;
    const str = String(value);
    if (key === "expected_growth_date" || key === "notes") {
      out[key] = str.trim() === "" ? null : str;
    } else if (str.trim() === "") {
      continue;
    } else {
      out[key] = str;
    }
  }
  return out;
}

function readScenarioFormPayload(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const payload: Record<string, unknown> = {
    assumptions: readScenarioAssumptionsFromForm(input),
  };
  if (input.has("scenario_id")) {
    payload.scenario_id = String(input.get("scenario_id") ?? "");
  }
  if (input.has("name")) {
    payload.name = String(input.get("name") ?? "");
  }
  if (input.has("description")) {
    const desc = input.get("description");
    payload.description = desc === null ? null : String(desc);
  }
  if (input.has("make_current")) {
    payload.make_current = input.get("make_current");
  }
  return payload;
}

export async function adminCreateLaunchPlanningScenario(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.create_scenario");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readScenarioFormPayload(input);
  const v = validateCreateLaunchPlanningScenarioPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCreateLaunchPlanningScenario(client, {
    p_name: v.value.name,
    p_description: v.value.description,
    p_assumptions: v.value.assumptions as Record<string, unknown>,
    p_make_current: v.value.make_current,
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
    return actionFail(["The scenario was not saved. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  // Diagnostic counts only — never log notes contents or descriptions.
  ctx.finish("ok", {
    actor_role,
    has_description: v.value.description !== null,
    make_current: v.value.make_current,
    has_notes_field: Object.prototype.hasOwnProperty.call(v.value.assumptions, "notes"),
  });
  return actionOk({ id: data });
}

export async function adminUpdateLaunchPlanningScenario(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.update_scenario");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readScenarioFormPayload(input);
  const v = validateUpdateLaunchPlanningScenarioPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateLaunchPlanningScenario(client, {
    p_scenario_id: v.value.scenario_id,
    p_name: v.value.name,
    p_description: v.value.description,
    p_assumptions: v.value.assumptions as Record<string, unknown>,
    p_make_current: v.value.make_current,
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
    return actionFail(["The scenario was not saved. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  ctx.finish("ok", {
    actor_role,
    has_description: v.value.description !== null,
    make_current: v.value.make_current,
    has_notes_field: Object.prototype.hasOwnProperty.call(v.value.assumptions, "notes"),
  });
  return actionOk({ id: data });
}

export async function adminArchiveLaunchPlanningScenario(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.archive_scenario");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw =
    input instanceof FormData
      ? { scenario_id: String(input.get("scenario_id") ?? "") }
      : input;
  const v = validateScenarioIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminArchiveLaunchPlanningScenario(client, {
    p_scenario_id: v.value.scenario_id,
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
    return actionFail(["The scenario was not archived. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}

export async function adminSetCurrentLaunchPlanningScenario(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.set_current_scenario");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw =
    input instanceof FormData
      ? { scenario_id: String(input.get("scenario_id") ?? "") }
      : input;
  const v = validateScenarioIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminSetCurrentLaunchPlanningScenario(client, {
    p_scenario_id: v.value.scenario_id,
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
    return actionFail(["The scenario was not made current. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}
