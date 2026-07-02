"use server";

import {
  validateGroupMetricSettingsPayload,
  validateMetricDefaultsPayload,
  validateHealthRubricPayload,
  validateReadinessRulePayload,
  validateSetGroupTypesPayload,
  validateSetGroupTypeConfigPayload,
  type GroupMetricSettingsPayload,
  type HealthRubricPayload,
  type MetricDefaultsPayload,
  type ReadinessRulePayload,
  type SetGroupTypesPayload,
  type SetGroupTypeConfigPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";
import { updateTag } from "next/cache";
import {
  METRIC_DEFAULTS_CACHE_TAG,
  GROUP_TYPES_CACHE_TAG,
} from "@/lib/supabase/cached-config";

// Settings writes fan out to every surface that reads thresholds.
const SETTINGS_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin/groups",
  "/admin",
  "/leader",
  // The Group-health triage Watch filter reads metric defaults (Watch grade,
  // attendance decline margin, healthy-attendance %), so a threshold edit must
  // revalidate it too — otherwise the cached route keeps the old filtering.
  "/admin/group-health",
] as const;

// Check-in cadence keys (missed_checkin_warning_weeks, check_in_due_offset_hours)
// are intentionally absent: their Settings form fields were retired (#160,
// check-ins are a frozen surface per ADR 0002), and the read-only reference
// rows that replaced them were retired from the surface too (#472). The dead
// check_in_due_day_of_week field was dropped from the surface entirely (#221);
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

// check_in_due_offset_hours_override is intentionally absent (#472): the
// hidden round-trip field was retired from the per-group form (check-ins are a
// frozen surface, ADR 0002, and nothing visible consumes the offset). The key
// is never read from the submitted FormData; the validator normalizes the
// absent field to null, so the full-state upsert RPC clears any stored
// override on the next save — the clear path for existing rows.
const GROUP_METRIC_FIELDS = [
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
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
    adminRpc(client, "admin_update_metric_defaults", {
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
  // bust the tag so the saved values are reflected on the next read. This is a
  // Server Action, so use Next 16's `updateTag` (immediate expiration +
  // read-your-own-writes) rather than `revalidateTag(tag, "max")`, which would
  // serve stale thresholds on the first post-save navigation.
  if (result.ok) updateTag(METRIC_DEFAULTS_CACHE_TAG);
  return result;
}

// ----- adminUpsertGroupMetricSettings -------------------------------------

// toRpcArgs key list: the upsert RPC args are exactly these payload fields,
// p_-prefixed. check_in_due_offset_hours_override is NOT a form field (see
// GROUP_METRIC_FIELDS above) but stays an RPC arg: always null since #472 (the
// validator normalizes the absent field), and the frozen full-state RPC still
// accepts it, so passing null keeps stored overrides clearable on every save.
const GROUP_METRIC_ARG_KEYS = [
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

const UPSERT_GROUP_METRIC_SPEC: AdminWriteActionSpec<
  GroupMetricSettingsPayload,
  { id: string }
> = {
  name: "admin.settings.upsert_group_metric_settings",
  read: readGroupMetricForm,
  validate: validateGroupMetricSettingsPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_upsert_group_metric_settings",
      toRpcArgs(value, GROUP_METRIC_ARG_KEYS)
    ),
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
  rpc: (client) => adminRpc(client, "admin_reset_metric_defaults", {}),
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
  if (result.ok) updateTag(METRIC_DEFAULTS_CACHE_TAG);
  return result;
}

// ----- adminSetHealthRubric (#374 / ADR 0018) -----------------------------
// The Settings Health Rubric editor (group rubric) posts the criteria array as
// a JSON string plus the kind; the validator runs the weight-to-100 gate before
// the audited RPC persists it. Ministry-Admin-owned, so the default
// requireAdminSession path applies.
const SET_HEALTH_RUBRIC_SPEC: AdminWriteActionSpec<
  HealthRubricPayload,
  { id: string }
> = {
  name: "admin.settings.set_health_rubric",
  keys: ["kind", "criteria"],
  validate: validateHealthRubricPayload,
  fields: (_actor, value) => ({
    rubric_kind: value.kind,
    criteria_count: value.criteria.length,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_health_rubric", {
      p_kind: value.kind,
      p_criteria: value.criteria as unknown as Array<Record<string, unknown>>,
    }),
  revalidate: () => SETTINGS_REVALIDATE_PATHS,
  noDataError: "The rubric was not saved. Please try again.",
};

export async function adminSetHealthRubric(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_HEALTH_RUBRIC_SPEC, prev, input);
}

// ----- Group types list (Settings > Groups) -------------------------------
// The Settings > Groups editor posts the canonical free-text type-name list as a
// newline-separated blob (one name per line). The validator trims, dedupes
// (case-insensitive), and bounds the list; the audited admin_set_group_types RPC
// replaces the app_settings `group_types` row and stays the authoritative gate.
// Ministry-Admin-owned, so the default requireAdminSession path applies.
// Revalidates every surface that reads the list (Settings, Groups, Multiply, the
// admin home).
const GROUP_TYPES_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin",
  "/admin/multiply",
  "/admin/groups",
] as const;

const SET_GROUP_TYPES_SPEC: AdminWriteActionSpec<
  SetGroupTypesPayload,
  { id: string }
> = {
  name: "admin.settings.set_group_types",
  keys: ["types", "types_text"],
  validate: validateSetGroupTypesPayload,
  fields: (_actor, value) => ({ type_count: value.types.length }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_group_types", { p_types: value.types }),
  revalidate: () => GROUP_TYPES_REVALIDATE_PATHS,
  noDataError: "The group types were not saved. Please try again.",
};

export async function adminSetGroupTypes(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const result = await runAdminWriteAction(SET_GROUP_TYPES_SPEC, prev, input);
  // group_types is cached cross-request (lib/supabase/cached-config.ts); bust
  // the tag so the new list is reflected on the next read.
  if (result.ok) updateTag(GROUP_TYPES_CACHE_TAG);
  return result;
}

// ----- Per-type config (Multiply) -----------------------------------------
// Multiply posts one group type's config: a target group count plus an optional
// readiness-rule override (null/empty = inherit the single global rule). The
// validator decodes the override through the pure trust-boundary decoder; the
// audited admin_set_group_type_config RPC upserts the row keyed on the free-text
// type name and stays the authoritative gate.
const SET_GROUP_TYPE_CONFIG_SPEC: AdminWriteActionSpec<
  SetGroupTypeConfigPayload,
  { id: string }
> = {
  name: "admin.settings.set_group_type_config",
  keys: ["group_type", "target_count", "readiness_rule"],
  validate: validateSetGroupTypeConfigPayload,
  fields: (_actor, value) => ({
    group_type: value.groupType,
    target_count: value.targetCount,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_group_type_config", {
      p_group_type: value.groupType,
      p_target_count: value.targetCount,
      p_readiness_rule: value.readinessRule as Record<string, unknown> | null,
    }),
  revalidate: () => GROUP_TYPES_REVALIDATE_PATHS,
  noDataError: "The type config was not saved. Please try again.",
};

export async function adminSetGroupTypeConfig(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_GROUP_TYPE_CONFIG_SPEC, prev, input);
}

// ----- Global readiness rule ----------------------------------------------
// The single GLOBAL readiness rule (ministry_year + the rule JSON). Each type
// can override it via its per-type config above; with no override a type inherits
// this rule. Ministry-Admin-owned, so the default requireAdminSession path
// applies. Revalidates the Multiply boards as well as Settings.
const READINESS_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin/multiply",
] as const;

const SET_READINESS_RULE_SPEC: AdminWriteActionSpec<
  ReadinessRulePayload,
  { id: string }
> = {
  name: "admin.settings.set_readiness_rule",
  keys: ["ministry_year", "rule"],
  validate: validateReadinessRulePayload,
  fields: (_actor, value) => ({ ministry_year: value.ministryYear }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_readiness_rule", {
      p_ministry_year: value.ministryYear,
      p_rule: value.rule as unknown as Record<string, unknown>,
    }),
  revalidate: () => READINESS_REVALIDATE_PATHS,
  noDataError: "The readiness rule was not saved. Please try again.",
};

export async function adminSetReadinessRule(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_READINESS_RULE_SPEC, prev, input);
}
