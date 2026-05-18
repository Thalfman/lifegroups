"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import {
  validateGroupMetricSettingsPayload,
  validateMetricDefaultsPayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminUpdateMetricDefaults,
  rpcAdminUpsertGroupMetricSettings,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH_SETTINGS = "/admin/settings";
const REVALIDATE_PATH_GROUPS = "/admin/groups";

const METRIC_DEFAULT_FIELDS = [
  "default_group_capacity",
  "capacity_warning_threshold_pct",
  "capacity_full_threshold_pct",
  "check_in_due_day_of_week",
  "missed_checkin_warning_weeks",
  "default_healthy_attendance_pct",
] as const;

const GROUP_METRIC_FIELDS = [
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
] as const;

// Only include a key in the payload when the form actually submitted a
// value. The RPC merges only the submitted keys, so an unchecked checkbox
// must surface as a true boolean (false), but an untouched number input
// (which posts "") must be omitted entirely so the stored value is kept.
function readMetricDefaultsForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of METRIC_DEFAULT_FIELDS) {
    if (input.has(key)) {
      const value = input.get(key);
      if (value !== null) {
        const str = String(value);
        // Treat empty form input on default_group_capacity as explicit
        // "clear to Unknown"; otherwise an empty string means "field not
        // submitted -> ignore". The form-side guarantees `default_group_capacity`
        // is always present via a hidden marker if needed; here we keep
        // the simpler rule: empty string for default_group_capacity = null.
        if (key === "default_group_capacity") {
          out[key] = str.trim() === "" ? null : str;
        } else if (str.trim() === "") {
          // Skip: don't pass through empty fields for other keys.
        } else {
          out[key] = str;
        }
      }
    }
  }
  return out;
}

function readGroupMetricForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of GROUP_METRIC_FIELDS) {
    if (key === "exclude_from_capacity_metrics") {
      // Browsers omit unchecked checkboxes from the FormData entirely.
      // Treat absence as `false` so a checkbox cleared by the operator
      // round-trips correctly.
      out[key] = input.has(key);
      continue;
    }
    const value = input.get(key);
    out[key] = value === null ? undefined : String(value);
  }
  return out;
}

export async function adminUpdateMetricDefaults(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readMetricDefaultsForm(input);
  const v = validateMetricDefaultsPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  if (Object.keys(v.value).length === 0) {
    return actionFail(["Nothing to change. Adjust a field before saving."]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminUpdateMetricDefaults(client, {
    p_settings: v.value as Record<string, unknown>,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The settings were not saved. Please try again."]);

  revalidatePath(REVALIDATE_PATH_SETTINGS);
  revalidatePath(REVALIDATE_PATH_GROUPS);
  return actionOk({ id: data });
}

export async function adminUpsertGroupMetricSettings(
  _prev: ActionResult<{ id: string }> | undefined,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readGroupMetricForm(input);
  const v = validateGroupMetricSettingsPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminUpsertGroupMetricSettings(client, {
    p_group_id: v.value.group_id,
    p_capacity_override: v.value.capacity_override,
    p_capacity_warning_threshold_pct_override:
      v.value.capacity_warning_threshold_pct_override,
    p_healthy_attendance_pct_override: v.value.healthy_attendance_pct_override,
    p_manual_health_status_override: v.value.manual_health_status_override,
    p_exclude_from_capacity_metrics: v.value.exclude_from_capacity_metrics,
    p_admin_metric_notes: v.value.admin_metric_notes,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The override was not saved. Please try again."]);

  revalidatePath(REVALIDATE_PATH_SETTINGS);
  revalidatePath(REVALIDATE_PATH_GROUPS);
  return actionOk({ id: data });
}
