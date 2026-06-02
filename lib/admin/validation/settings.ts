import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  readOptionalString,
  normalizeUuid,
  readOptionalInteger,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase 5A.4 — Metric settings + leader role swap payloads
// ---------------------------------------------------------------------------

const GROUP_HEALTH_STATUSES = new Set([
  "healthy",
  "watch",
  "needs_follow_up",
  "healthy_paused",
  "restart_soon",
  "overdue_restart",
  "capacity_full",
  "needs_leader_support",
]);

function isGroupHealthStatus(value: unknown): value is string {
  return typeof value === "string" && GROUP_HEALTH_STATUSES.has(value);
}

function readOptionalBoolean(value: unknown): boolean | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "") return undefined;
    if (trimmed === "true" || trimmed === "on" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "off" || trimmed === "0")
      return false;
    return "invalid";
  }
  return "invalid";
}

// Each key is optional in the submitted payload. The RPC merges the
// submitted subset onto the stored row, so omitting a key leaves the
// existing default in place. The bounds here mirror the RPC body so
// the validation reject path uses friendlier messages while the RPC
// stays the security boundary.
export type MetricDefaultsPayload = {
  default_group_capacity?: number | null;
  capacity_warning_threshold_pct?: number;
  capacity_full_threshold_pct?: number;
  missed_checkin_warning_weeks?: number;
  default_healthy_attendance_pct?: number;
  check_in_due_offset_hours?: number;
  shepherd_care_stale_days_direct?: number;
  shepherd_care_stale_days_delegated?: number;
};

const METRIC_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  "default_group_capacity",
  "capacity_warning_threshold_pct",
  "capacity_full_threshold_pct",
  "missed_checkin_warning_weeks",
  "default_healthy_attendance_pct",
  "check_in_due_offset_hours",
  "shepherd_care_stale_days_direct",
  "shepherd_care_stale_days_delegated",
]);

export function validateMetricDefaultsPayload(
  input: unknown
): ValidationResult<MetricDefaultsPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  // Reject keys outside the whitelist so the UI surfaces typos.
  for (const key of Object.keys(input)) {
    if (!METRIC_DEFAULT_KEYS.has(key)) {
      errors.push(`Unknown setting key: ${key}`);
    }
  }

  const value: MetricDefaultsPayload = {};

  if ("default_group_capacity" in input) {
    const raw = input.default_group_capacity;
    if (raw === null || raw === "" || raw === undefined) {
      // Allow explicit clearing back to Unknown by sending null.
      // The form posts "" for an empty number input; treat both as null.
      value.default_group_capacity = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Default capacity must be a whole number.");
      else if (n !== undefined && (n < 1 || n > 500))
        errors.push("Default capacity must be between 1 and 500.");
      else if (n !== undefined) value.default_group_capacity = n;
    }
  }

  if ("capacity_warning_threshold_pct" in input) {
    const n = readOptionalInteger(input.capacity_warning_threshold_pct);
    if (n === "invalid")
      errors.push("Capacity warning % must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 300))
      errors.push("Capacity warning % must be between 0 and 300.");
    else if (n !== undefined) value.capacity_warning_threshold_pct = n;
  }

  if ("capacity_full_threshold_pct" in input) {
    const n = readOptionalInteger(input.capacity_full_threshold_pct);
    if (n === "invalid") errors.push("Capacity full % must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 300))
      errors.push("Capacity full % must be between 1 and 300.");
    else if (n !== undefined) value.capacity_full_threshold_pct = n;
  }

  if ("missed_checkin_warning_weeks" in input) {
    const n = readOptionalInteger(input.missed_checkin_warning_weeks);
    if (n === "invalid")
      errors.push("Missed check-in warning weeks must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 12))
      errors.push("Missed check-in warning weeks must be between 1 and 12.");
    else if (n !== undefined) value.missed_checkin_warning_weeks = n;
  }

  if ("default_healthy_attendance_pct" in input) {
    const n = readOptionalInteger(input.default_healthy_attendance_pct);
    if (n === "invalid")
      errors.push("Healthy attendance % must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 100))
      errors.push("Healthy attendance % must be between 0 and 100.");
    else if (n !== undefined) value.default_healthy_attendance_pct = n;
  }

  if ("check_in_due_offset_hours" in input) {
    const n = readOptionalInteger(input.check_in_due_offset_hours);
    if (n === "invalid")
      errors.push("Check-in due offset hours must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 336))
      errors.push(
        "Check-in due offset hours must be between 0 and 336 (14 days)."
      );
    else if (n !== undefined) value.check_in_due_offset_hours = n;
  }

  if ("shepherd_care_stale_days_direct" in input) {
    const n = readOptionalInteger(input.shepherd_care_stale_days_direct);
    if (n === "invalid")
      errors.push(
        "Directly-overseen stale-contact days must be a whole number."
      );
    else if (n !== undefined && (n < 7 || n > 365))
      errors.push(
        "Directly-overseen stale-contact days must be between 7 and 365."
      );
    else if (n !== undefined) value.shepherd_care_stale_days_direct = n;
  }

  if ("shepherd_care_stale_days_delegated" in input) {
    const n = readOptionalInteger(input.shepherd_care_stale_days_delegated);
    if (n === "invalid")
      errors.push("Delegated stale-contact days must be a whole number.");
    else if (n !== undefined && (n < 7 || n > 365))
      errors.push("Delegated stale-contact days must be between 7 and 365.");
    else if (n !== undefined) value.shepherd_care_stale_days_delegated = n;
  }

  // Cross-field: full % must be >= warning % when both present (or fall
  // back to the documented defaults so a one-sided submit can still be
  // validated sanely).
  const stagedFull =
    value.capacity_full_threshold_pct !== undefined
      ? value.capacity_full_threshold_pct
      : undefined;
  const stagedWarning =
    value.capacity_warning_threshold_pct !== undefined
      ? value.capacity_warning_threshold_pct
      : undefined;
  if (
    stagedFull !== undefined &&
    stagedWarning !== undefined &&
    stagedFull < stagedWarning
  ) {
    errors.push(
      "Capacity full % must be greater than or equal to capacity warning %."
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export type GroupMetricSettingsPayload = {
  group_id: string;
  capacity_override: number | null;
  capacity_warning_threshold_pct_override: number | null;
  healthy_attendance_pct_override: number | null;
  manual_health_status_override: string | null;
  exclude_from_capacity_metrics: boolean;
  admin_metric_notes: string | null;
  check_in_due_offset_hours_override: number | null;
  allow_over_capacity: boolean;
};

export function validateGroupMetricSettingsPayload(
  input: unknown
): ValidationResult<GroupMetricSettingsPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");

  let capacityOverride: number | null = null;
  {
    const raw = input.capacity_override;
    if (raw === undefined || raw === null || raw === "") {
      capacityOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Capacity override must be a whole number.");
      else if (n === undefined) capacityOverride = null;
      else if (n < 1 || n > 500)
        errors.push("Capacity override must be between 1 and 500.");
      else capacityOverride = n;
    }
  }

  let warningOverride: number | null = null;
  {
    const raw = input.capacity_warning_threshold_pct_override;
    if (raw === undefined || raw === null || raw === "") {
      warningOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Capacity warning % override must be a whole number.");
      else if (n === undefined) warningOverride = null;
      else if (n < 0 || n > 300)
        errors.push("Capacity warning % override must be between 0 and 300.");
      else warningOverride = n;
    }
  }

  let healthyOverride: number | null = null;
  {
    const raw = input.healthy_attendance_pct_override;
    if (raw === undefined || raw === null || raw === "") {
      healthyOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Healthy attendance % override must be a whole number.");
      else if (n === undefined) healthyOverride = null;
      else if (n < 0 || n > 100)
        errors.push("Healthy attendance % override must be between 0 and 100.");
      else healthyOverride = n;
    }
  }

  let checkInOffsetOverride: number | null = null;
  {
    const raw = input.check_in_due_offset_hours_override;
    if (raw === undefined || raw === null || raw === "") {
      checkInOffsetOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Check-in due offset override must be a whole number.");
      else if (n === undefined) checkInOffsetOverride = null;
      else if (n < 0 || n > 336)
        errors.push(
          "Check-in due offset override must be between 0 and 336 (14 days)."
        );
      else checkInOffsetOverride = n;
    }
  }

  let manualHealth: string | null = null;
  {
    const raw = input.manual_health_status_override;
    if (raw === undefined || raw === null || raw === "" || raw === "none") {
      manualHealth = null;
    } else if (isGroupHealthStatus(raw)) {
      manualHealth = raw;
    } else {
      errors.push("Manual health status override is not a valid value.");
    }
  }

  let excludeFromCapacity = false;
  {
    const raw = readOptionalBoolean(input.exclude_from_capacity_metrics);
    if (raw === "invalid")
      errors.push("Exclude from capacity must be true or false.");
    else if (raw !== undefined) excludeFromCapacity = raw;
  }

  let allowOverCapacity = false;
  {
    const raw = readOptionalBoolean(input.allow_over_capacity);
    if (raw === "invalid")
      errors.push("Keep open past capacity must be true or false.");
    else if (raw !== undefined) allowOverCapacity = raw;
  }

  let notes: string | null = null;
  {
    const raw = readOptionalString(input.admin_metric_notes);
    if (raw === undefined) notes = null;
    else if (raw.length > 1000)
      errors.push("Notes are too long (max 1000 characters).");
    else notes = raw;
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      capacity_override: capacityOverride,
      capacity_warning_threshold_pct_override: warningOverride,
      healthy_attendance_pct_override: healthyOverride,
      manual_health_status_override: manualHealth,
      exclude_from_capacity_metrics: excludeFromCapacity,
      admin_metric_notes: notes,
      check_in_due_offset_hours_override: checkInOffsetOverride,
      allow_over_capacity: allowOverCapacity,
    },
  };
}
