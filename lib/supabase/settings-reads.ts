import type {
  AppSettingsRow,
  ChurchAttendanceSnapshotsRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  GroupTypeConfigsRow,
  LaunchPlanningScenariosRow,
  PlatformConfigRow,
} from "@/types/database";
import { isUuid } from "@/lib/shared/uuid";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";
import { fetchAllGroups } from "./group-reads";
import { fetchActiveMemberships } from "./membership-reads";

// Trust-boundary guards for settings rows. Validate the discriminating
// fields before letting a Supabase response be treated as the typed row;
// guard failures route through the same wrapError channel as PostgREST
// errors so callers don't need a new branch.

function isAppSettingsRow(v: unknown): v is AppSettingsRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.setting_key === "string" &&
    typeof r.setting_value === "object" &&
    r.setting_value !== null
  );
}

function isGroupMetricSettingsRow(v: unknown): v is GroupMetricSettingsRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  return isUuid((v as Record<string, unknown>).group_id);
}

// Phase 5A.4: Settings readers.

// Column allowlist for the keyed app_settings readers (#495); every
// AppSettingsRow column, pinned by a colocated test. Shared by the
// metric-defaults, group-health-rubric, and launch-planning-assumptions
// readers — they all fetch one keyed row and guard it with isAppSettingsRow.
export const APP_SETTINGS_COLUMNS = columns<AppSettingsRow>()(
  "id",
  "setting_key",
  "setting_value",
  "created_at",
  "updated_at"
);

// Returns the single `metric_defaults` row from `app_settings`. The row is
// seeded by the Phase 5A.4 migration and never deleted; a `null` return
// here means either Supabase rejected the read or the row was manually
// removed. Callers should treat null as "use built-in defaults".
export async function fetchMetricDefaults(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_COLUMNS.select)
    .eq("setting_key", "metric_defaults")
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchMetricDefaults", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchMetricDefaults", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// Returns the admin-managed canonical free-text group-type list from the
// `group_types` keyed app_settings row (`{ types: string[] }`). Mirrors
// fetchMetricDefaults: a null/absent/shape-invalid row decodes to the empty
// list (no types configured yet). Admin-only via RLS.
export async function fetchGroupTypes(
  client: ReadClient
): Promise<ReadResult<string[]>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_COLUMNS.select)
    .eq("setting_key", "group_types")
    .maybeSingle();
  if (error) return { data: null, error: wrapError("fetchGroupTypes", error) };
  if (data === null || data === undefined) return { data: [], error: null };
  const row: unknown = data;
  if (!isAppSettingsRow(row)) {
    return {
      data: null,
      error: wrapError("fetchGroupTypes", new Error("shape_invalid")),
    };
  }
  const raw = (row.setting_value as Record<string, unknown>).types;
  if (!Array.isArray(raw)) return { data: [], error: null };
  const types = raw.filter((v): v is string => typeof v === "string");
  return { data: types, error: null };
}

// Returns the per-type config rows (target group count + optional readiness-rule
// override) keyed on the free-text group_type name. A type with no row inherits
// target 0 + the single global readiness rule. Admin-only via RLS.
const GROUP_TYPE_CONFIG_COLUMNS =
  "group_type, target_count, readiness_rule, in_pipeline" as const;

export type GroupTypeConfigEntry = Pick<
  GroupTypeConfigsRow,
  "group_type" | "target_count" | "readiness_rule" | "in_pipeline"
>;

export async function fetchGroupTypeConfigs(
  client: ReadClient
): Promise<ReadResult<GroupTypeConfigEntry[]>> {
  const { data, error } = await client
    .from("group_type_configs")
    .select(GROUP_TYPE_CONFIG_COLUMNS)
    .order("group_type", { ascending: true });
  if (error)
    return { data: null, error: wrapError("fetchGroupTypeConfigs", error) };
  return { data: (data ?? []) as GroupTypeConfigEntry[], error: null };
}

// Phase SAC.1 (#159): returns the single `platform_config` row from the
// Super-Admin-only platform_config table. RLS scopes the read to super_admin;
// a non-super-admin caller sees no row (and the console route never reaches
// here anyway). A `null` return means the row is missing or the read failed;
// callers decode null to the built-in config via decodeAppConfig.
export async function fetchPlatformConfig(
  client: ReadClient
): Promise<
  ReadResult<Pick<PlatformConfigRow, "setting_key" | "setting_value"> | null>
> {
  // Project only the columns the decoder needs. This is a Super-Admin-only
  // store slated to hold future flags + editable copy, so an explicit column
  // list keeps later schema additions from silently widening the console's
  // read surface (vs. select("*")).
  const { data, error } = await client
    .from("platform_config")
    .select("setting_key, setting_value")
    .eq("setting_key", "platform_config")
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchPlatformConfig", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchPlatformConfig", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// Admin-readable feature-flag state (#256). Unlike fetchPlatformConfig, this
// reads through the SECURITY DEFINER admin_read_feature_flags() RPC, which
// returns ONLY the feature_flags sub-object and admits both super_admin and
// ministry_admin (auth_is_admin()). It exists so a frozen-surface gate resolves
// identically for both admin roles — a ministry_admin can't read platform_config
// directly, so the table read would always fail closed for them. The verify-
// before-flip rule still lives in lib/admin/feature-flags; this only fetches the
// stored flag map (decode it with decodeFeatureFlags). A null return means the
// RPC errored; callers decode null to "all flags off".
export async function fetchAdminFeatureFlags(
  client: ReadClient
): Promise<ReadResult<unknown>> {
  const { data, error } = await client.rpc("admin_read_feature_flags" as never);
  if (error)
    return { data: null, error: wrapError("fetchAdminFeatureFlags", error) };
  return { data: data ?? null, error: null };
}

// Returns the single `group_health_rubric` row from `app_settings`, holding the
// admin-tuned Group-Health weights / cut-lines / attendance window (#129). No
// row yet means the rubric has never been tuned; callers decode `null` to the
// built-in rubric, so an absent row is a safe no-op rather than an error.
export async function fetchGroupHealthRubricSetting(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_COLUMNS.select)
    .eq("setting_key", "group_health_rubric")
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchGroupHealthRubricSetting", error),
    };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError(
        "fetchGroupHealthRubricSetting",
        new Error("shape_invalid")
      ),
    };
  }
  return { data, error: null };
}

const CHURCH_ATTENDANCE_SNAPSHOT_COLUMNS =
  "id, snapshot_date, attendance_count, note, created_by_profile_id, " +
  "created_at, updated_at";

// Julian P2: most-recent-first church attendance snapshots. The first row is
// the latest known church-wide attendance, the denominator for the
// "% of the church in a life group" headline. Admin-only via RLS.
export async function fetchChurchAttendanceSnapshots(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<ChurchAttendanceSnapshotsRow[]>> {
  const limit = options.limit ?? 12;
  const { data, error } = await client
    .from("church_attendance_snapshots")
    .select(CHURCH_ATTENDANCE_SNAPSHOT_COLUMNS)
    .order("snapshot_date", { ascending: false })
    .limit(limit);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchChurchAttendanceSnapshots", error),
    };
  }
  return { data: (data ?? []) as ChurchAttendanceSnapshotsRow[], error: null };
}

// Returns every row in group_metric_settings. RLS on the table restricts
// reads to super_admin / ministry_admin, so calling this from any
// non-admin context will surface as an empty result. Admin pages call
// this once at load time and join client-side by group_id.
// Column allowlist for the per-group metric-override readers (#495); every
// GroupMetricSettingsRow column, pinned by a colocated test.
export const GROUP_METRIC_SETTINGS_COLUMNS = columns<GroupMetricSettingsRow>()(
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
  "check_in_due_offset_hours_override",
  "allow_over_capacity",
  "created_at",
  "updated_at"
);

export async function fetchAllGroupMetricSettings(
  client: ReadClient
): Promise<ReadResult<GroupMetricSettingsRow[]>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select(GROUP_METRIC_SETTINGS_COLUMNS.select)
    .returns<GroupMetricSettingsRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchAllGroupMetricSettings", error),
    };
  return { data: data ?? [], error: null };
}

export async function fetchGroupMetricSettings(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<GroupMetricSettingsRow | null>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select(GROUP_METRIC_SETTINGS_COLUMNS.select)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchGroupMetricSettings", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isGroupMetricSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchGroupMetricSettings", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// LP.1 — launch planning assumptions
// ---------------------------------------------------------------------------
//
// Reads the single `launch_planning_assumptions` row from app_settings.
// Uses the shared APP_SETTINGS_COLUMNS allowlist (no select("*") on
// launch-planning paths) and the same `isAppSettingsRow` trust-boundary
// guard as the metric_defaults reader. A `null` data return means either
// the row was never seeded (treat as "use built-in defaults") or the shape
// guard rejected the row.
export async function fetchLaunchPlanningAssumptions(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_COLUMNS.select)
    .eq("setting_key", "launch_planning_assumptions")
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningAssumptions", error),
    };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError(
        "fetchLaunchPlanningAssumptions",
        new Error("shape_invalid")
      ),
    };
  }
  return { data, error: null };
}

// Bundle the four independent reads the launch-planning page needs.
// Returns a partial-success shape so the page can render setup warnings
// when any individual read fails, rather than blanking the whole page.
export type LaunchPlanningInputsBundle = {
  groups: GroupsRow[];
  groupMetricSettings: GroupMetricSettingsRow[];
  memberships: GroupMembershipsRow[];
  metricDefaultsRow: AppSettingsRow | null;
  errors: {
    groups: string | null;
    overrides: string | null;
    memberships: string | null;
    metricDefaults: string | null;
  };
};

export async function fetchLaunchPlanningInputsForAdmin(
  client: ReadClient
): Promise<LaunchPlanningInputsBundle> {
  const [groupsRes, overridesRes, membershipsRes, defaultsRes] =
    await Promise.all([
      fetchAllGroups(client),
      fetchAllGroupMetricSettings(client),
      fetchActiveMemberships(client),
      fetchMetricDefaults(client),
    ]);
  return {
    groups: groupsRes.data ?? [],
    groupMetricSettings: overridesRes.data ?? [],
    memberships: membershipsRes.data ?? [],
    metricDefaultsRow: defaultsRes.data ?? null,
    errors: {
      groups: groupsRes.error?.message ?? null,
      overrides: overridesRes.error?.message ?? null,
      memberships: membershipsRes.error?.message ?? null,
      metricDefaults: defaultsRes.error?.message ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// LP.2 — launch planning scenarios
// ---------------------------------------------------------------------------
//
// Explicit column allowlist. `assumptions` is a JSONB column; the trust-
// boundary guard checks it's a plain object before the row is handed to
// the pure decoder.

const LAUNCH_PLANNING_SCENARIO_COLUMNS =
  "id, name, description, assumptions, is_current, archived_at, created_by, updated_by, created_at, updated_at";

function isLaunchPlanningScenarioRow(
  v: unknown
): v is LaunchPlanningScenariosRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (!isUuid(r.id)) return false;
  if (typeof r.name !== "string") return false;
  if (typeof r.is_current !== "boolean") return false;
  if (
    typeof r.assumptions !== "object" ||
    r.assumptions === null ||
    Array.isArray(r.assumptions)
  ) {
    return false;
  }
  return true;
}

export async function fetchLaunchPlanningScenariosForAdmin(
  client: ReadClient
): Promise<ReadResult<LaunchPlanningScenariosRow[]>> {
  const { data, error } = await client
    .from("launch_planning_scenarios")
    .select(LAUNCH_PLANNING_SCENARIO_COLUMNS)
    .order("is_current", { ascending: false })
    .order("name", { ascending: true });
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningScenariosForAdmin", error),
    };
  const raw: unknown[] = (data ?? []) as unknown[];
  const rows: LaunchPlanningScenariosRow[] = [];
  for (const row of raw) {
    if (isLaunchPlanningScenarioRow(row)) rows.push(row);
  }
  return { data: rows, error: null };
}

export async function fetchLaunchPlanningScenarioByIdForAdmin(
  client: ReadClient,
  id: string
): Promise<ReadResult<LaunchPlanningScenariosRow | null>> {
  const { data, error } = await client
    .from("launch_planning_scenarios")
    .select(LAUNCH_PLANNING_SCENARIO_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningScenarioByIdForAdmin", error),
    };
  if (data == null) return { data: null, error: null };
  const raw: unknown = data;
  if (!isLaunchPlanningScenarioRow(raw)) {
    return {
      data: null,
      error: wrapError(
        "fetchLaunchPlanningScenarioByIdForAdmin",
        new Error("shape_invalid")
      ),
    };
  }
  return { data: raw, error: null };
}
