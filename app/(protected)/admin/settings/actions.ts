"use server";

import {
  validateGroupMetricSettingsPayload,
  validateMetricDefaultsPayload,
  validateHealthRubricPayload,
  validateMultiplicationConfigPayload,
  validateCreateGroupCategoryPayload,
  validateRenameGroupCategoryPayload,
  validateArchiveGroupCategoryPayload,
  validateSetCategoryTypeCellPayload,
  validateSetCategoryTypeTargetCountPayload,
  type GroupMetricSettingsPayload,
  type HealthRubricPayload,
  type MetricDefaultsPayload,
  type MultiplicationConfigPayload,
  type CreateGroupCategoryPayload,
  type RenameGroupCategoryPayload,
  type ArchiveGroupCategoryPayload,
  type SetCategoryTypeCellPayload,
  type SetCategoryTypeTargetCountPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminResetMetricDefaults,
  rpcAdminSetHealthRubric,
  rpcAdminSetMultiplicationConfig,
  rpcAdminUpdateMetricDefaults,
  rpcAdminUpsertGroupMetricSettings,
  rpcAdminCreateGroupCategory,
  rpcAdminRenameGroupCategory,
  rpcAdminArchiveGroupCategory,
  rpcAdminSetCategoryTypeCell,
  rpcAdminSetCategoryTypeTargetCount,
} from "@/lib/admin/rpc";
import { revalidateTag } from "next/cache";
import { METRIC_DEFAULTS_CACHE_TAG } from "@/lib/supabase/cached-config";

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
    rpcAdminSetHealthRubric(client, {
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

// ----- adminSetMultiplicationConfig (#380) --------------------------------
// The Settings Multiply-pillars editor posts one group type's config for a
// ministry year: the group_type, ministry_year, and three JSON payloads
// (thresholds, trigger, fed capacity). The validator decodes + normalizes them
// before the audited RPC persists them. Ministry-Admin-owned, so the default
// requireAdminSession path applies. Revalidates the Multiply boards as well as
// Settings (the boards read this config).
const MULTIPLICATION_CONFIG_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin/multiply",
] as const;

const SET_MULTIPLICATION_CONFIG_SPEC: AdminWriteActionSpec<
  MultiplicationConfigPayload,
  { id: string }
> = {
  name: "admin.settings.set_multiplication_config",
  keys: [
    "group_type",
    "ministry_year",
    "thresholds",
    "trigger",
    "fed_capacity",
  ],
  validate: validateMultiplicationConfigPayload,
  fields: (_actor, value) => ({
    group_type: value.groupType,
    ministry_year: value.ministryYear,
  }),
  rpc: (client, value) =>
    rpcAdminSetMultiplicationConfig(client, {
      p_group_type: value.groupType,
      p_ministry_year: value.ministryYear,
      p_thresholds: value.thresholds as unknown as Record<string, unknown>,
      p_trigger: value.trigger as unknown as Record<string, unknown>,
      p_fed_capacity: value.fedCapacity as unknown as Record<string, unknown>,
    }),
  revalidate: () => MULTIPLICATION_CONFIG_REVALIDATE_PATHS,
  noDataError: "The multiplication config was not saved. Please try again.",
};

export async function adminSetMultiplicationConfig(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_MULTIPLICATION_CONFIG_SPEC, prev, input);
}

// ----- Group Category catalog + cell matrix (#396) ------------------------
// The Settings > Groups editor posts free-form catalog CRUD (create / rename /
// archive) and the (top type × category) cell apply/unapply. Each is a separate
// audited RPC; the validators keep malformed input off the wire and the RPCs
// stay the authoritative gate (duplicate-label / missing-category re-checked
// there). Ministry-Admin-owned, so the default requireAdminSession path applies.
// Revalidates Settings; the matrix feeds the Multiply grid in a later slice.
const GROUP_CATEGORY_REVALIDATE_PATHS = [
  "/admin/settings",
  "/admin/multiply",
] as const;

const CREATE_GROUP_CATEGORY_SPEC: AdminWriteActionSpec<
  CreateGroupCategoryPayload,
  { id: string }
> = {
  name: "admin.settings.create_group_category",
  keys: ["label"],
  validate: validateCreateGroupCategoryPayload,
  rpc: (client, value) =>
    rpcAdminCreateGroupCategory(client, { p_label: value.label }),
  revalidate: () => GROUP_CATEGORY_REVALIDATE_PATHS,
  noDataError: "The category was not created. Please try again.",
};

export async function adminCreateGroupCategory(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_GROUP_CATEGORY_SPEC, prev, input);
}

const RENAME_GROUP_CATEGORY_SPEC: AdminWriteActionSpec<
  RenameGroupCategoryPayload,
  { id: string }
> = {
  name: "admin.settings.rename_group_category",
  keys: ["category_id", "label"],
  validate: validateRenameGroupCategoryPayload,
  fields: (_actor, value) => ({ target_category_id: value.categoryId }),
  rpc: (client, value) =>
    rpcAdminRenameGroupCategory(client, {
      p_category_id: value.categoryId,
      p_label: value.label,
    }),
  revalidate: () => GROUP_CATEGORY_REVALIDATE_PATHS,
  noDataError: "The category was not renamed. Please try again.",
};

export async function adminRenameGroupCategory(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RENAME_GROUP_CATEGORY_SPEC, prev, input);
}

const ARCHIVE_GROUP_CATEGORY_SPEC: AdminWriteActionSpec<
  ArchiveGroupCategoryPayload,
  { id: string }
> = {
  name: "admin.settings.archive_group_category",
  keys: ["category_id"],
  validate: validateArchiveGroupCategoryPayload,
  fields: (_actor, value) => ({ target_category_id: value.categoryId }),
  rpc: (client, value) =>
    rpcAdminArchiveGroupCategory(client, { p_category_id: value.categoryId }),
  revalidate: () => GROUP_CATEGORY_REVALIDATE_PATHS,
  noDataError: "The category was not removed. Please try again.",
};

export async function adminArchiveGroupCategory(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_GROUP_CATEGORY_SPEC, prev, input);
}

const SET_CATEGORY_TYPE_CELL_SPEC: AdminWriteActionSpec<
  SetCategoryTypeCellPayload,
  { id: string }
> = {
  name: "admin.settings.set_category_type_cell",
  keys: ["category_id", "audience_category", "active"],
  validate: validateSetCategoryTypeCellPayload,
  fields: (_actor, value) => ({
    target_category_id: value.categoryId,
    audience_category: value.audienceCategory,
    active: value.active,
  }),
  rpc: (client, value) =>
    rpcAdminSetCategoryTypeCell(client, {
      p_category_id: value.categoryId,
      p_audience_category: value.audienceCategory,
      p_active: value.active,
    }),
  revalidate: () => GROUP_CATEGORY_REVALIDATE_PATHS,
  noDataError: "The change was not saved. Please try again.",
};

export async function adminSetCategoryTypeCell(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_CATEGORY_TYPE_CELL_SPEC, prev, input);
}

// #400 / PRD §2.3: set a cell's target group count (the "have X of Y" Y). Same
// audited-RPC pattern as the cell apply; tracking only, so it shares the Groups
// revalidate paths but feeds no trigger.
const SET_CATEGORY_TYPE_TARGET_COUNT_SPEC: AdminWriteActionSpec<
  SetCategoryTypeTargetCountPayload,
  { id: string }
> = {
  name: "admin.settings.set_category_type_target_count",
  keys: ["category_id", "audience_category", "target_count"],
  validate: validateSetCategoryTypeTargetCountPayload,
  fields: (_actor, value) => ({
    target_category_id: value.categoryId,
    audience_category: value.audienceCategory,
    target_count: value.count,
  }),
  rpc: (client, value) =>
    rpcAdminSetCategoryTypeTargetCount(client, {
      p_category_id: value.categoryId,
      p_audience_category: value.audienceCategory,
      p_count: value.count,
    }),
  revalidate: () => GROUP_CATEGORY_REVALIDATE_PATHS,
  noDataError: "The target was not saved. Please try again.",
};

export async function adminSetCategoryTypeTargetCount(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_CATEGORY_TYPE_TARGET_COUNT_SPEC, prev, input);
}
