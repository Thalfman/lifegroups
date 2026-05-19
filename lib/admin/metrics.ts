// Phase 5A.4 dashboard-prep helpers. Pure functions; no I/O, no Supabase.
//
// These compute "effective" capacity / health / threshold values from a
// trio of inputs:
//   * defaults (decoded from app_settings.metric_defaults via decodeMetricDefaults)
//   * the per-group override row (group_metric_settings), or null
//   * the group itself (groups row)
//
// Future /admin dashboard logic consumes these so capacity_status,
// missing-check-in flags, and manual health overrides can be derived
// in one place. Tests can call these with bare objects.

import type {
  AppSettingsRow,
  AttendanceSessionsRow,
  GroupMetricSettingsRow,
  GroupsRow,
} from "@/types/database";
import type { GroupHealthStatus } from "@/types/enums";

// ---------------------------------------------------------------------------
// Defaults decoding
// ---------------------------------------------------------------------------

export type MetricDefaults = {
  default_group_capacity: number | null;
  capacity_warning_threshold_pct: number;
  capacity_full_threshold_pct: number;
  // Legacy: a global "check-ins are due on this day-of-week" hint. Kept
  // for backwards compatibility / nostalgia, but the Phase 5A.5 due-date
  // computation is now per-group (meeting_day + meeting_time + offset).
  check_in_due_day_of_week: number;
  missed_checkin_warning_weeks: number;
  default_healthy_attendance_pct: number;
  // Phase 5A.5: hours after a group's scheduled meeting time before its
  // check-in is considered overdue. 24 = "due 24 hours after meeting".
  check_in_due_offset_hours: number;
};

// Documented baseline values. Mirrors the Phase 5A.5 reset RPC so
// "reset defaults" in the UI and the seeded values stay in sync.
// If you change one, change the other.
export const BUILT_IN_METRIC_DEFAULTS: MetricDefaults = {
  default_group_capacity: null,
  capacity_warning_threshold_pct: 80,
  capacity_full_threshold_pct: 100,
  check_in_due_day_of_week: 1,
  missed_checkin_warning_weeks: 2,
  default_healthy_attendance_pct: 60,
  check_in_due_offset_hours: 24,
};

function readJsonInt(
  source: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
): number {
  if (!source) return fallback;
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw)) return raw;
  return fallback;
}

function readJsonIntOrNull(
  source: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number | null,
): number | null {
  if (!source) return fallback;
  const raw = source[key];
  if (raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw)) return raw;
  return fallback;
}

export function decodeMetricDefaults(row: AppSettingsRow | null): MetricDefaults {
  const source = (row?.setting_value as Record<string, unknown> | null) ?? null;
  return {
    default_group_capacity: readJsonIntOrNull(
      source,
      "default_group_capacity",
      BUILT_IN_METRIC_DEFAULTS.default_group_capacity,
    ),
    capacity_warning_threshold_pct: readJsonInt(
      source,
      "capacity_warning_threshold_pct",
      BUILT_IN_METRIC_DEFAULTS.capacity_warning_threshold_pct,
    ),
    capacity_full_threshold_pct: readJsonInt(
      source,
      "capacity_full_threshold_pct",
      BUILT_IN_METRIC_DEFAULTS.capacity_full_threshold_pct,
    ),
    check_in_due_day_of_week: readJsonInt(
      source,
      "check_in_due_day_of_week",
      BUILT_IN_METRIC_DEFAULTS.check_in_due_day_of_week,
    ),
    missed_checkin_warning_weeks: readJsonInt(
      source,
      "missed_checkin_warning_weeks",
      BUILT_IN_METRIC_DEFAULTS.missed_checkin_warning_weeks,
    ),
    default_healthy_attendance_pct: readJsonInt(
      source,
      "default_healthy_attendance_pct",
      BUILT_IN_METRIC_DEFAULTS.default_healthy_attendance_pct,
    ),
    check_in_due_offset_hours: readJsonInt(
      source,
      "check_in_due_offset_hours",
      BUILT_IN_METRIC_DEFAULTS.check_in_due_offset_hours,
    ),
  };
}

// ---------------------------------------------------------------------------
// Effective capacity / thresholds
// ---------------------------------------------------------------------------

type GroupRef = Pick<GroupsRow, "capacity">;
type OverrideRef = Pick<
  GroupMetricSettingsRow,
  | "capacity_override"
  | "capacity_warning_threshold_pct_override"
  | "healthy_attendance_pct_override"
  | "manual_health_status_override"
  | "exclude_from_capacity_metrics"
  | "admin_metric_notes"
  | "check_in_due_offset_hours_override"
> | null;

export function effectiveCapacity(
  group: GroupRef,
  override: OverrideRef,
  defaults: MetricDefaults,
): number | null {
  if (override?.capacity_override != null) return override.capacity_override;
  if (group.capacity != null) return group.capacity;
  return defaults.default_group_capacity;
}

// Returns true only when no effective capacity is available -- that is,
// the per-group override, the per-group capacity, AND the global default
// are all null. If a default is configured, the dashboard treats the
// group as "Default capacity (N)" rather than "Unknown", so this helper
// must consult defaults too. Earlier versions ignored defaults, which
// caused a group to display "/ Unknown" while capacityStatus still
// coloured it warning/full from the configured default.
export function unknownCapacity(
  group: GroupRef,
  override: OverrideRef,
  defaults: MetricDefaults,
): boolean {
  return effectiveCapacity(group, override, defaults) == null;
}

export function effectiveCapacityWarningPct(
  override: OverrideRef,
  defaults: MetricDefaults,
): number {
  if (override?.capacity_warning_threshold_pct_override != null)
    return override.capacity_warning_threshold_pct_override;
  return defaults.capacity_warning_threshold_pct;
}

export function effectiveCapacityFullPct(defaults: MetricDefaults): number {
  return defaults.capacity_full_threshold_pct;
}

export function effectiveHealthyAttendancePct(
  override: OverrideRef,
  defaults: MetricDefaults,
): number {
  if (override?.healthy_attendance_pct_override != null)
    return override.healthy_attendance_pct_override;
  return defaults.default_healthy_attendance_pct;
}

// Phase 5A.5: the per-group check-in due offset (in hours after the
// scheduled meeting). Falls back to the global default when no override
// is set. Kept here so admin + leader surfaces compute "due" identically.
//
// Takes a narrower override shape (only the offset field) so callers
// that just need due-date math don't have to pass every override field.
export function effectiveCheckInDueOffsetHours(
  override:
    | Pick<GroupMetricSettingsRow, "check_in_due_offset_hours_override">
    | null
    | undefined,
  defaults: MetricDefaults,
): number {
  if (override?.check_in_due_offset_hours_override != null)
    return override.check_in_due_offset_hours_override;
  return defaults.check_in_due_offset_hours;
}

// ---------------------------------------------------------------------------
// Capacity status
// ---------------------------------------------------------------------------

export type CapacityStatus = "unknown" | "excluded" | "ok" | "warning" | "full";

export function capacityStatus(args: {
  activeMemberCount: number;
  effectiveCapacity: number | null;
  warningPct: number;
  fullPct: number;
  excluded: boolean;
}): CapacityStatus {
  if (args.excluded) return "excluded";
  if (args.effectiveCapacity == null) return "unknown";
  if (args.effectiveCapacity <= 0) return "unknown";
  const pct = (args.activeMemberCount / args.effectiveCapacity) * 100;
  if (pct >= args.fullPct) return "full";
  if (pct >= args.warningPct) return "warning";
  return "ok";
}

// ---------------------------------------------------------------------------
// Health status (manual override wins)
// ---------------------------------------------------------------------------

export function effectiveHealthStatus(
  group: Pick<GroupsRow, "health_status">,
  override: OverrideRef,
): GroupHealthStatus {
  if (override?.manual_health_status_override) return override.manual_health_status_override;
  return group.health_status;
}

export function isExcludedFromCapacityMetrics(override: OverrideRef): boolean {
  return Boolean(override?.exclude_from_capacity_metrics);
}

// A group_metric_settings row counts as having "active" overrides only
// when at least one field carries a non-default value. A row that exists
// but has every field cleared is treated identically to "no row" for UI
// purposes (e.g., the overrides summary list filters it out).
export function hasActiveOverrides(
  settings: GroupMetricSettingsRow | null | undefined,
): boolean {
  if (!settings) return false;
  if (settings.capacity_override != null) return true;
  if (settings.capacity_warning_threshold_pct_override != null) return true;
  if (settings.healthy_attendance_pct_override != null) return true;
  if (settings.manual_health_status_override != null) return true;
  if (settings.exclude_from_capacity_metrics) return true;
  if (settings.check_in_due_offset_hours_override != null) return true;
  if (
    typeof settings.admin_metric_notes === "string" &&
    settings.admin_metric_notes.trim().length > 0
  )
    return true;
  return false;
}

// ---------------------------------------------------------------------------
// Missing check-in detection
// ---------------------------------------------------------------------------

// Returns true when a group's latest known attendance session is older
// than the configured warning window relative to `now`. A null session
// means the group has never submitted a check-in, which we treat as
// missing iff the configured warning window has elapsed since group
// creation -- but Phase 5A.4 only stores the inputs and lets the caller
// supply the comparison `now`, so we keep this function purely
// arithmetic on the session date.
export function missingCheckIn(args: {
  latestSession: Pick<AttendanceSessionsRow, "meeting_week"> | null;
  warningWeeks: number;
  now: Date;
}): boolean {
  if (!args.latestSession) return true;
  const week = new Date(`${args.latestSession.meeting_week}T00:00:00Z`);
  if (Number.isNaN(week.getTime())) return true;
  const diffMs = args.now.getTime() - week.getTime();
  const diffWeeks = diffMs / (7 * 24 * 60 * 60 * 1000);
  return diffWeeks > args.warningWeeks;
}
