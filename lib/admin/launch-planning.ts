// LP.1 — Capacity & Launch Planning MVP. Pure helpers; no I/O, no Supabase.
//
// This module mirrors the layout of `lib/admin/metrics.ts`:
//   * decode a single JSONB app_settings row into a typed assumption shape,
//     falling back to the documented defaults for any missing key,
//   * aggregate already-fetched repo state (groups + overrides + memberships
//     + metric defaults) into a `LaunchPlanningInputs` summary,
//   * compute the forecast outputs from `(assumptions, inputs)`.
//
// Capacity math reuses `effectiveCapacity()` and
// `isExcludedFromCapacityMetrics()` from `lib/admin/metrics.ts` so the
// launch-planning page can never drift from the rest of the admin
// dashboard's capacity view.

import type {
  AppSettingsRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  LaunchPlanningScenariosRow,
} from "@/types/database";
import { isRecord } from "@/lib/admin/validation";
import {
  effectiveCapacity,
  isExcludedFromCapacityMetrics,
  type MetricDefaults,
} from "@/lib/admin/metrics";

// ---------------------------------------------------------------------------
// Assumptions: typed shape + defaults + decoder
// ---------------------------------------------------------------------------

export type LaunchPlanningAssumptions = {
  current_church_attendance: number;
  expected_growth: number;
  expected_growth_date: string | null;
  target_group_participation_pct: number;
  average_group_size: number;
  launch_buffer_pct: number;
  leaders_per_new_group: number;
  notes: string | null;
};

// Documented baseline values. Mirrors the seed block in
// supabase/migrations/20260518190000_phase_lp1_launch_planning.sql.
// If you change one, change the other.
export const BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS: LaunchPlanningAssumptions = {
  current_church_attendance: 100,
  expected_growth: 20,
  expected_growth_date: null,
  target_group_participation_pct: 0.6,
  average_group_size: 10,
  launch_buffer_pct: 0.15,
  leaders_per_new_group: 2,
  notes: null,
};

function readJsonInt(
  source: Record<string, unknown> | null,
  key: string,
  fallback: number,
): number {
  if (!source) return fallback;
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw)) return raw;
  return fallback;
}

function readJsonNumber(
  source: Record<string, unknown> | null,
  key: string,
  fallback: number,
): number {
  if (!source) return fallback;
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return fallback;
}

function readJsonNullableString(
  source: Record<string, unknown> | null,
  key: string,
  fallback: string | null,
): string | null {
  if (!source) return fallback;
  const raw = source[key];
  if (raw === null) return null;
  if (typeof raw === "string") return raw;
  return fallback;
}

// `metricDefaults` lets the decoder fall back to the ministry-wide
// default group capacity for `average_group_size` when neither the
// stored row nor the built-in default has a more specific value.
// The seeded row hard-codes 10, but `metric_defaults.default_group_capacity`
// is a better fallback once an operator has configured it. The fallback
// only applies when `average_group_size` is missing from the stored row.
export function decodeLaunchPlanningAssumptions(
  row: AppSettingsRow | null,
  metricDefaults?: Pick<MetricDefaults, "default_group_capacity"> | null,
): LaunchPlanningAssumptions {
  const raw = row?.setting_value;
  const source: Record<string, unknown> | null = isRecord(raw) ? raw : null;

  const fallbackAverageGroupSize =
    metricDefaults?.default_group_capacity != null &&
    metricDefaults.default_group_capacity > 0
      ? metricDefaults.default_group_capacity
      : BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.average_group_size;

  return {
    current_church_attendance: readJsonInt(
      source,
      "current_church_attendance",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.current_church_attendance,
    ),
    expected_growth: readJsonInt(
      source,
      "expected_growth",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth,
    ),
    expected_growth_date: readJsonNullableString(
      source,
      "expected_growth_date",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth_date,
    ),
    target_group_participation_pct: readJsonNumber(
      source,
      "target_group_participation_pct",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.target_group_participation_pct,
    ),
    average_group_size: readJsonInt(
      source,
      "average_group_size",
      fallbackAverageGroupSize,
    ),
    launch_buffer_pct: readJsonNumber(
      source,
      "launch_buffer_pct",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.launch_buffer_pct,
    ),
    leaders_per_new_group: readJsonInt(
      source,
      "leaders_per_new_group",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.leaders_per_new_group,
    ),
    notes: readJsonNullableString(
      source,
      "notes",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.notes,
    ),
  };
}

// ---------------------------------------------------------------------------
// Inputs aggregator (pure)
// ---------------------------------------------------------------------------

export type LaunchPlanningInputs = {
  // Active = lifecycle_status === "active". Closed / launching_soon /
  // needs_leader / at_risk / paused do NOT count toward capacity.
  active_group_count: number;
  // Excluded by group_metric_settings.exclude_from_capacity_metrics.
  // These groups are active but the operator opted them out of the
  // capacity math. Surfaced as a setup warning so Julian knows the
  // forecast confidence is affected.
  excluded_active_group_count: number;
  // Active, not-excluded groups that have no effective capacity
  // (no per-group override, no per-group capacity, no ministry default).
  // These contribute nothing to `effective_total_capacity` but also
  // can't be re-included silently — they show up as a setup warning.
  unknown_capacity_group_count: number;
  effective_total_capacity: number;
  // Sum of active memberships across active, not-excluded groups.
  current_participants: number;
  // `effective_total_capacity - current_participants`, floored at 0.
  available_seats: number;
};

type GroupForInputs = Pick<
  GroupsRow,
  "id" | "lifecycle_status" | "capacity"
>;

type OverrideForInputs = Pick<
  GroupMetricSettingsRow,
  | "group_id"
  | "capacity_override"
  | "exclude_from_capacity_metrics"
  | "capacity_warning_threshold_pct_override"
  | "healthy_attendance_pct_override"
  | "manual_health_status_override"
  | "admin_metric_notes"
  | "check_in_due_offset_hours_override"
  | "allow_over_capacity"
>;

type MembershipForInputs = Pick<
  GroupMembershipsRow,
  "group_id" | "status"
>;

export function buildLaunchPlanningInputs(args: {
  groups: readonly GroupForInputs[];
  overrides: readonly OverrideForInputs[];
  memberships: readonly MembershipForInputs[];
  metricDefaults: MetricDefaults;
}): LaunchPlanningInputs {
  const overridesByGroup = new Map<string, OverrideForInputs>();
  for (const o of args.overrides) overridesByGroup.set(o.group_id, o);

  const activeMembershipCounts = new Map<string, number>();
  for (const m of args.memberships) {
    if (m.status !== "active") continue;
    activeMembershipCounts.set(
      m.group_id,
      (activeMembershipCounts.get(m.group_id) ?? 0) + 1,
    );
  }

  let activeGroupCount = 0;
  let excludedActiveGroupCount = 0;
  let unknownCapacityGroupCount = 0;
  let effectiveTotalCapacity = 0;
  let currentParticipants = 0;

  for (const g of args.groups) {
    if (g.lifecycle_status !== "active") continue;
    activeGroupCount += 1;

    const override = overridesByGroup.get(g.id) ?? null;
    if (isExcludedFromCapacityMetrics(override)) {
      excludedActiveGroupCount += 1;
      continue;
    }

    const cap = effectiveCapacity(
      { capacity: g.capacity },
      override,
      args.metricDefaults,
    );
    if (cap == null || cap <= 0) {
      unknownCapacityGroupCount += 1;
    } else {
      effectiveTotalCapacity += cap;
    }
    currentParticipants += activeMembershipCounts.get(g.id) ?? 0;
  }

  const availableSeats = Math.max(
    0,
    effectiveTotalCapacity - currentParticipants,
  );

  return {
    active_group_count: activeGroupCount,
    excluded_active_group_count: excludedActiveGroupCount,
    unknown_capacity_group_count: unknownCapacityGroupCount,
    effective_total_capacity: effectiveTotalCapacity,
    current_participants: currentParticipants,
    available_seats: availableSeats,
  };
}

// ---------------------------------------------------------------------------
// Outputs (computeLaunchPlan)
// ---------------------------------------------------------------------------

export type LaunchPlanningRiskLevel = "ok" | "watch" | "launch_needed";

export type LaunchPlanningOutputs = {
  projected_total_attendance: number;
  projected_group_demand: number;
  target_capacity_with_buffer: number;
  capacity_gap: number;
  recommended_new_groups: number;
  estimated_new_leaders_needed: number;
  risk_level: LaunchPlanningRiskLevel;
  // Suggested launch milestone derived from `expected_growth_date`. Null
  // when no growth date is set; otherwise an ISO date string 30 days
  // before the growth date (so groups exist before the projected influx).
  suggested_launch_by_date: string | null;
};

function clampNonNegative(n: number): number {
  return n > 0 ? n : 0;
}

// Subtract `days` from an ISO `YYYY-MM-DD` date string using UTC math.
// Returns null if the input doesn't parse.
function subtractDaysIso(iso: string, days: number): string | null {
  // Strict format gate so a malformed string can't slide through Date's
  // forgiving parser. ISO-8601 calendar date only.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  const t = parsed.getTime();
  if (!Number.isFinite(t)) return null;
  const moved = new Date(t - days * 24 * 60 * 60 * 1000);
  return moved.toISOString().slice(0, 10);
}

export function computeLaunchPlan(
  assumptions: LaunchPlanningAssumptions,
  inputs: Pick<LaunchPlanningInputs, "effective_total_capacity">,
): LaunchPlanningOutputs {
  // expected_growth can legitimately be negative (shrinkage), but the
  // *projected attendance* and *demand* must stay non-negative — a
  // projected -400 attendees is meaningless and would propagate to a
  // negative demand / oversized capacity gap in the UI. Clamp at zero
  // so the forecast stays physically meaningful even at the extremes.
  const projectedTotalAttendance = clampNonNegative(
    assumptions.current_church_attendance + assumptions.expected_growth,
  );

  const participationPct = Math.min(
    1,
    Math.max(0, assumptions.target_group_participation_pct),
  );
  const projectedGroupDemand = clampNonNegative(
    projectedTotalAttendance * participationPct,
  );

  const bufferPct = Math.min(
    // Never let the (1 - bufferPct) denominator reach zero. The RPC
    // caps at 0.95; clamp here too so a stale payload from disk can't
    // produce Infinity.
    0.95,
    Math.max(0, assumptions.launch_buffer_pct),
  );
  const targetCapacityWithBuffer = projectedGroupDemand / (1 - bufferPct);

  const capacityGap = targetCapacityWithBuffer - inputs.effective_total_capacity;

  // `average_group_size` is validated >= 1 at the RPC and validator, but
  // we still defend against a 0/negative slipping in from a hand-rolled
  // payload — fall back to 1 so we never divide by zero.
  const avgGroupSize = Math.max(1, Math.floor(assumptions.average_group_size));
  const recommendedNewGroups = Math.ceil(
    clampNonNegative(capacityGap) / avgGroupSize,
  );

  const leadersPerNewGroup = Math.max(0, Math.floor(assumptions.leaders_per_new_group));
  const estimatedNewLeadersNeeded = recommendedNewGroups * leadersPerNewGroup;

  // Risk level:
  //   OK            → no new groups recommended.
  //   Watch         → some are recommended, but the gap fits within the
  //                   configured buffer headroom (so we're being
  //                   precautionary, not urgent).
  //   Launch Needed → the gap exceeds the buffer headroom — actual
  //                   demand will overrun configured capacity.
  let riskLevel: LaunchPlanningRiskLevel;
  if (recommendedNewGroups === 0) {
    riskLevel = "ok";
  } else if (capacityGap <= projectedGroupDemand * bufferPct) {
    riskLevel = "watch";
  } else {
    riskLevel = "launch_needed";
  }

  const suggestedLaunchByDate =
    assumptions.expected_growth_date && recommendedNewGroups > 0
      ? subtractDaysIso(assumptions.expected_growth_date, 30)
      : null;

  return {
    projected_total_attendance: projectedTotalAttendance,
    projected_group_demand: projectedGroupDemand,
    target_capacity_with_buffer: targetCapacityWithBuffer,
    capacity_gap: capacityGap,
    recommended_new_groups: recommendedNewGroups,
    estimated_new_leaders_needed: estimatedNewLeadersNeeded,
    risk_level: riskLevel,
    suggested_launch_by_date: suggestedLaunchByDate,
  };
}

// ---------------------------------------------------------------------------
// Audit redaction (pure)
// ---------------------------------------------------------------------------
//
// The RPC computes its audit metadata in PL/pgSQL, but the TypeScript
// layer also needs to be able to assert "we never include the notes
// body in audit metadata" as a unit test. Exposing the redaction shape
// as a pure helper makes that testable without spinning up Postgres.

export type LaunchPlanningAuditSnapshot = {
  current_church_attendance: number;
  expected_growth: number;
  expected_growth_date: string | null;
  target_group_participation_pct: number;
  average_group_size: number;
  launch_buffer_pct: number;
  leaders_per_new_group: number;
  has_notes: boolean;
};

export function redactNotesForAudit(
  assumptions: LaunchPlanningAssumptions,
): LaunchPlanningAuditSnapshot {
  return {
    current_church_attendance: assumptions.current_church_attendance,
    expected_growth: assumptions.expected_growth,
    expected_growth_date: assumptions.expected_growth_date,
    target_group_participation_pct: assumptions.target_group_participation_pct,
    average_group_size: assumptions.average_group_size,
    launch_buffer_pct: assumptions.launch_buffer_pct,
    leaders_per_new_group: assumptions.leaders_per_new_group,
    has_notes:
      typeof assumptions.notes === "string" && assumptions.notes.trim().length > 0,
  };
}

// ---------------------------------------------------------------------------
// LP.2 — Scenario helpers (pure)
// ---------------------------------------------------------------------------
//
// Scenarios are stored in their own table (see migration
// 20260518200000_phase_lp2_launch_planning_scenarios.sql). The fetched
// row's `assumptions` column is JSONB; the decoder reuses the same
// fallback logic as the LP.1 baseline so missing fields cascade to the
// configured metric defaults.

export type LaunchPlanningScenarioStatus = "active" | "archived";

// Pared-down view of the DB row that the UI cares about. Hides the
// JSONB shape behind a typed `assumptions` object so callers can render
// without reaching into raw column data.
export type LaunchPlanningScenario = {
  id: string;
  name: string;
  description: string | null;
  is_current: boolean;
  archived_at: string | null;
  status: LaunchPlanningScenarioStatus;
  assumptions: LaunchPlanningAssumptions;
  created_at: string;
  updated_at: string;
};

// Decode a single scenarios row into a typed scenario. Reuses the LP.1
// decoder so the assumption fallback chain (stored JSON → metric defaults →
// built-in defaults) stays in one place. Wrap the raw assumptions in a
// fake app_settings row shape so the decoder can read it without a second
// implementation; assumptions are always an object thanks to the table's
// CHECK constraint.
export function decodeLaunchPlanningScenario(
  row: LaunchPlanningScenariosRow,
  metricDefaults?: Parameters<typeof decodeLaunchPlanningAssumptions>[1],
): LaunchPlanningScenario {
  const assumptions = decodeLaunchPlanningAssumptions(
    {
      id: row.id,
      setting_key: "launch_planning_scenarios.assumptions",
      setting_value: row.assumptions,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as AppSettingsRow,
    metricDefaults,
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    is_current: row.is_current,
    archived_at: row.archived_at,
    status: row.archived_at == null ? "active" : "archived",
    assumptions,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Pure filter for the active-list rendering. Mirrors the partial unique
// index's "where archived_at is null" predicate so the UI can never show
// an archived scenario in the active list.
export function filterActiveScenarios<T extends { archived_at: string | null }>(
  scenarios: readonly T[],
): T[] {
  return scenarios.filter((s) => s.archived_at == null);
}

export function findCurrentScenario(
  scenarios: readonly LaunchPlanningScenario[],
): LaunchPlanningScenario | null {
  return (
    scenarios.find((s) => s.is_current && s.status === "active") ?? null
  );
}

// Computed view of a scenario for the comparison table. Bundles the
// scenario metadata with the launch-plan outputs so the rendering layer
// doesn't have to re-run `computeLaunchPlan` per column.
export type LaunchPlanningScenarioComparisonEntry = {
  scenario: LaunchPlanningScenario;
  outputs: LaunchPlanningOutputs;
};

// Build the comparison model from a list of scenarios + the shared
// capacity inputs. The inputs come from the dashboard read paths
// (active groups, overrides, memberships) so every scenario gets compared
// against the same effective capacity number.
export function buildScenarioComparison(
  scenarios: readonly LaunchPlanningScenario[],
  inputs: Pick<LaunchPlanningInputs, "effective_total_capacity">,
): LaunchPlanningScenarioComparisonEntry[] {
  return scenarios.map((scenario) => ({
    scenario,
    outputs: computeLaunchPlan(scenario.assumptions, inputs),
  }));
}
