"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateCandidateIdPayload,
  validateCreateMultiplicationCandidatePayload,
  validateLaunchPlanningAssumptionsPayload,
  validateRecordChurchAttendancePayload,
  validateUpdateMultiplicationCandidatePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminArchiveMultiplicationCandidate,
  rpcAdminCreateMultiplicationCandidate,
  rpcAdminRecordChurchAttendanceSnapshot,
  rpcAdminUpdateLaunchPlanningAssumptions,
  rpcAdminUpdateMultiplicationCandidate,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_ADMIN = "/admin";

// Keep this list in lockstep with the validator's whitelist. The form
// only POSTs keys that were actually submitted (we read each by name),
// so a missing input collapses to "don't change this key" rather than
// being interpreted as a clear.
const LAUNCH_PLANNING_FIELDS = [
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
] as const;

// Translate a FormData (or plain object) into the validator's expected
// shape. Numeric fields are passed as strings — the validator's number
// readers accept either form. Empty strings collapse the field out of
// the patch so the stored value is preserved. The `expected_growth_date`
// and `notes` fields explicitly support null clearing: an empty string
// in those slots is treated as `null` so the operator can reset the
// stored value back to "no growth date" / "no notes".
function readLaunchPlanningForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of LAUNCH_PLANNING_FIELDS) {
    if (!input.has(key)) continue;
    const value = input.get(key);
    if (value === null) continue;
    const str = String(value);
    if (key === "expected_growth_date" || key === "notes") {
      // Form posts "" when the operator clears the field. Treat as null
      // to explicitly persist "no value" rather than skipping the merge.
      out[key] = str.trim() === "" ? null : str;
    } else if (str.trim() === "") {
      // Skip empty numeric inputs: an untouched field should not
      // overwrite the stored value.
      continue;
    } else {
      out[key] = str;
    }
  }
  return out;
}

export async function adminUpdateLaunchPlanningAssumptions(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.update_assumptions");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = readLaunchPlanningForm(input);
  const v = validateLaunchPlanningAssumptionsPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  if (Object.keys(v.value).length === 0) {
    ctx.finish("fail", { error_code: "empty_diff", actor_role });
    return actionFail(["Nothing to change. Adjust a field before saving."]);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateLaunchPlanningAssumptions(client, {
    p_settings: v.value as Record<string, unknown>,
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
    return actionFail(["The assumptions were not saved. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  // Diagnostic counts only — do NOT log notes-or-anything-derived-from
  // notes here, the audit row already records `has_notes` and the notes
  // body must never leak into observability.
  ctx.finish("ok", {
    actor_role,
    changed_field_count: Object.keys(v.value).length,
    has_notes_field: Object.prototype.hasOwnProperty.call(v.value, "notes"),
  });
  return actionOk({ id: data });
}

// Julian P2: record an actual church-attendance count for a date. Upserts by
// date so re-entering a date corrects the prior figure.
export async function adminRecordChurchAttendanceSnapshot(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.record_church_attendance");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw =
    input instanceof FormData
      ? {
          snapshot_date: input.get("snapshot_date"),
          attendance_count: input.get("attendance_count"),
          note: input.get("note"),
        }
      : input;
  const v = validateRecordChurchAttendancePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminRecordChurchAttendanceSnapshot(client, {
    p_snapshot_date: v.value.snapshot_date,
    p_attendance_count: v.value.attendance_count,
    p_note: v.value.note,
  });

  if (error) {
    ctx.finish("fail", { error_code: "rpc_error", rpc_token: error.message, actor_role });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role });
    return actionFail(["The attendance snapshot was not saved. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  revalidatePath(REVALIDATE_PATH_ADMIN);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}

// ----- Julian P4: multiplication candidate actions ------------------------

function readCandidateForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  return {
    group_id: input.get("group_id") ?? undefined,
    candidate_id: input.get("candidate_id") ?? undefined,
    target_year: input.get("target_year") ?? undefined,
    status: input.get("status") ?? undefined,
    // Checkboxes: presence = true, absence = false.
    shepherd_willing: input.has("shepherd_willing"),
    needs_similar_stage: input.has("needs_similar_stage"),
    notes: input.get("notes") ?? undefined,
  };
}

export async function adminCreateMultiplicationCandidate(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.create_multiplication_candidate");
  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const v = validateCreateMultiplicationCandidatePayload(readCandidateForm(input));
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCreateMultiplicationCandidate(client, {
    p_group_id: v.value.group_id,
    p_target_year: v.value.target_year,
    p_status: v.value.status,
    p_shepherd_willing: v.value.shepherd_willing,
    p_needs_similar_stage: v.value.needs_similar_stage,
    p_notes: v.value.notes,
  });
  if (error) {
    ctx.finish("fail", { error_code: "rpc_error", rpc_token: error.message, actor_role });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role });
    return actionFail(["The candidate was not saved. Please try again."]);
  }
  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}

export async function adminUpdateMultiplicationCandidate(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.update_multiplication_candidate");
  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const v = validateUpdateMultiplicationCandidatePayload(readCandidateForm(input));
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateMultiplicationCandidate(client, {
    p_candidate_id: v.value.candidate_id,
    p_target_year: v.value.target_year,
    p_status: v.value.status,
    p_shepherd_willing: v.value.shepherd_willing,
    p_needs_similar_stage: v.value.needs_similar_stage,
    p_notes: v.value.notes,
  });
  if (error) {
    ctx.finish("fail", { error_code: "rpc_error", rpc_token: error.message, actor_role });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role });
    return actionFail(["The candidate was not saved. Please try again."]);
  }
  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}

export async function adminArchiveMultiplicationCandidate(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.launch_planning.archive_multiplication_candidate");
  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw =
    input instanceof FormData
      ? { candidate_id: input.get("candidate_id") ?? undefined }
      : input;
  const v = validateCandidateIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminArchiveMultiplicationCandidate(client, {
    p_candidate_id: v.value.candidate_id,
  });
  if (error) {
    ctx.finish("fail", { error_code: "rpc_error", rpc_token: error.message, actor_role });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role });
    return actionFail(["The candidate was not archived. Please try again."]);
  }
  revalidatePath(REVALIDATE_PATH_LAUNCH_PLANNING);
  ctx.finish("ok", { actor_role });
  return actionOk({ id: data });
}
