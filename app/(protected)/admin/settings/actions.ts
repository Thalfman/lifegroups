"use server";

import {
  validateGroupMetricSettingsPayload,
  validateMetricDefaultsPayload,
  type GroupMetricSettingsPayload,
  type MetricDefaultsPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminResetMetricDefaults,
  rpcAdminUpdateMetricDefaults,
  rpcAdminUpsertGroupMetricSettings,
} from "@/lib/admin/rpc";
import { revalidateTag } from "next/cache";
import { METRIC_DEFAULTS_CACHE_TAG } from "@/lib/supabase/cached-config";

// Settings writes fan out to every surface that reads thresholds.
const SETTINGS_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin/groups",
  "/admin",
  "/leader",
] as const;

// Check-in cadence keys (missed_checkin_warning_weeks, check_in_due_offset_hours)
// are intentionally absent: their Settings form fields were retired (#160,
// check-ins are a frozen surface per ADR 0002). They now appear read-only under
// the Advanced thresholds disclosure (#221, "with their current defaults"). The
// dead check_in_due_day_of_week field was dropped from the surface entirely (#221);
// its metric_defaults column stays in the DB (no migration) and the reset RPC
// still manages it. The underlying columns stay put and still feed the dormant
// overdue calc, so none of these keys may be read from the submitted FormData.
const METRIC_DEFAULT_FIELDS = [
  "default_group_capacity",
  "capacity_warning_threshold_pct",
  "capacity_full_threshold_pct",
  "default_healthy_attendance_pct",
  "shepherd_care_stale_days_direct",
  "shepherd_care_stale_days_delegated",
  "group_health_watch_grade",
  "group_health_attendance_decline_margin_pct",
] as const;

const GROUP_METRIC_FIELDS = [
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
  "check_in_due_offset_hours_override",
  "allow_over_capacity",
] as const;

// Only include a key in the payload when the form actually submitted a
// value. The RPC merges only the submitted keys, so an unchecked checkbox
// must surface as a true boolean (false), but an untouched number input
// (which posts "") must be omitted entirely so the stored value is kept.
function readMetricDefaultsForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of METRIC_DEFAULT_FIELDS) {
    if (input.has(key)) {
      const value = input.get(key);
      if (value !== null) {
        const str = String(value);
        // Treat empty form input on default_group_capacity as explicit
        // "clear to Unknown"; otherwise an empty string means "field not
        // submitted -> ignore".
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
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of GROUP_METRIC_FIELDS) {
    if (
      key === "exclude_from_capacity_metrics" ||
      key === "allow_over_capacity"
    ) {
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

// ----- adminUpdateMetricDefaults ------------------------------------------

const UPDATE_METRIC_DEFAULTS_SPEC: AdminWriteActionSpec<
  MetricDefaultsPayload,
  { id: string }
> = {
  name: "admin.settings.update_metric_defaults",
  read: readMetricDefaultsForm,
  validate: validateMetricDefaultsPayload,
  guard: (_actor, value) =>
    Object.keys(value).length === 0
      ? {
          error: "Nothing to change. Adjust a field before saving.",
          code: "empty_diff",
          outcome: "fail",
        }
      : null,
  okFields: (value) => ({ changed_field_count: Object.keys(value).length }),
  rpc: (client, value) =>
    rpcAdminUpdateMetricDefaults(client, {
      p_settings: value as Record<string, unknown>,
    }),
  revalidate: () => SETTINGS_REVALIDATE_PATHS,
  noDataError: "The settings were not saved. Please try again.",
};

export async function adminUpdateMetricDefaults(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const result = await runAdminWriteAction(
    UPDATE_METRIC_DEFAULTS_SPEC,
    prev,
    input
  );
  // metric_defaults is cached cross-request (lib/supabase/cached-config.ts);
  // bust the tag so the saved values are reflected on the next read.
  if (result.ok) revalidateTag(METRIC_DEFAULTS_CACHE_TAG);
  return result;
}

// ----- adminUpsertGroupMetricSettings -------------------------------------

const UPSERT_GROUP_METRIC_SPEC: AdminWriteActionSpec<
  GroupMetricSettingsPayload,
  { id: string }
> = {
  name: "admin.settings.upsert_group_metric_settings",
  read: readGroupMetricForm,
  validate: validateGroupMetricSettingsPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: (client, value) =>
    rpcAdminUpsertGroupMetricSettings(client, {
      p_group_id: value.group_id,
      p_capacity_override: value.capacity_override,
      p_capacity_warning_threshold_pct_override:
        value.capacity_warning_threshold_pct_override,
      p_healthy_attendance_pct_override: value.healthy_attendance_pct_override,
      p_manual_health_status_override: value.manual_health_status_override,
      p_exclude_from_capacity_metrics: value.exclude_from_capacity_metrics,
      p_admin_metric_notes: value.admin_metric_notes,
      p_check_in_due_offset_hours_override:
        value.check_in_due_offset_hours_override,
      p_allow_over_capacity: value.allow_over_capacity,
    }),
  revalidate: () => SETTINGS_REVALIDATE_PATHS,
  noDataError: "The override was not saved. Please try again.",
};

export async function adminUpsertGroupMetricSettings(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPSERT_GROUP_METRIC_SPEC, prev, input);
}

// Phase 5A.5: reset metric defaults to the documented baseline. Does NOT
// touch per-group overrides; the UI surfaces this distinction so admins
// can clear overrides separately if they want a truly clean slate. Takes no
// input, so it validates to an empty payload and ignores the raw record.
const RESET_METRIC_DEFAULTS_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  { id: string }
> = {
  name: "admin.settings.reset_metric_defaults",
  read: () => ({}),
  validate: () => ({ ok: true, value: {} }),
  rpc: (client) => rpcAdminResetMetricDefaults(client),
  revalidate: () => SETTINGS_REVALIDATE_PATHS,
  noDataError: "The defaults were not reset. Please try again.",
};

export async function adminResetMetricDefaults(
  prev: ActionResult<{ id: string }> | undefined,
  _input: unknown
): Promise<ActionResult<{ id: string }>> {
  const result = await runAdminWriteAction(
    RESET_METRIC_DEFAULTS_SPEC,
    prev,
    undefined
  );
  // Resetting rewrites metric_defaults; bust the cache tag (see above).
  if (result.ok) revalidateTag(METRIC_DEFAULTS_CACHE_TAG);
  return result;
}
