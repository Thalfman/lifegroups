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
import type { LeaderReadinessStage } from "@/types/enums";
import { isRecord } from "@/lib/admin/validation";
import { jsonInt, jsonIntOrNull, jsonNumber } from "@/lib/admin/jsonb-decode";
import {
  effectiveCapacity,
  isExcludedFromCapacityMetrics,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import { apprenticeReadyBy } from "@/lib/admin/leader-pipeline";
import { subtractDaysIso as subtractDaysIsoUnchecked } from "@/lib/shared/church-time";
import {
  countActiveMembersByGroup,
  indexOverridesByGroup,
} from "@/lib/admin/group-capacity-inputs";

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
  // Capacity & Multiplication #186: the explicit "launch N by <season>" plan a
  // scenario carries on top of the demand assumptions. These drive the staffing
  // (leader) gap, reported separately from seat capacity (§3.4).
  planned_launch_count: number;
  // Julian's planting seasons: January (1) or August (8). Null = none set.
  target_launch_month: number | null;
  target_launch_year: number | null;
};

// Documented baseline values, mostly mirroring the seed block in
// supabase/migrations/20260518190000_phase_lp1_launch_planning.sql.
//
// L5 (#224): the default forecast asks only for current church attendance and
// target group participation; the rest are silently defaulted. `expected_growth`
// now defaults to 0 (assume no growth unless a scenario says otherwise) rather
// than the optimistic 20 it started at — this intentionally diverges from the
// seed, which is left untouched (no migration). Existing rows that still carry
// the seeded growth (20) and size (10) are normalized to these defaults for the
// baseline forecast at read time via `applyBaselineSilentDefaults`, so no data
// change is needed.
export const BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS: LaunchPlanningAssumptions = {
  current_church_attendance: 100,
  expected_growth: 0,
  expected_growth_date: null,
  target_group_participation_pct: 0.6,
  average_group_size: 10,
  launch_buffer_pct: 0.15,
  leaders_per_new_group: 2,
  notes: null,
  planned_launch_count: 0,
  target_launch_month: null,
  target_launch_year: null,
};

function readJsonNullableString(
  source: Record<string, unknown> | null,
  key: string,
  fallback: string | null
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
  metricDefaults?: Pick<MetricDefaults, "default_group_capacity"> | null
): LaunchPlanningAssumptions {
  const raw = row?.setting_value;
  const source: Record<string, unknown> | null = isRecord(raw) ? raw : null;

  const fallbackAverageGroupSize =
    metricDefaults?.default_group_capacity != null &&
    metricDefaults.default_group_capacity > 0
      ? metricDefaults.default_group_capacity
      : BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.average_group_size;

  return {
    current_church_attendance: jsonInt(
      source,
      "current_church_attendance",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.current_church_attendance
    ),
    expected_growth: jsonInt(
      source,
      "expected_growth",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth
    ),
    expected_growth_date: readJsonNullableString(
      source,
      "expected_growth_date",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth_date
    ),
    target_group_participation_pct: jsonNumber(
      source,
      "target_group_participation_pct",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.target_group_participation_pct
    ),
    average_group_size: jsonInt(
      source,
      "average_group_size",
      fallbackAverageGroupSize
    ),
    launch_buffer_pct: jsonNumber(
      source,
      "launch_buffer_pct",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.launch_buffer_pct
    ),
    leaders_per_new_group: jsonInt(
      source,
      "leaders_per_new_group",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.leaders_per_new_group
    ),
    notes: readJsonNullableString(
      source,
      "notes",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.notes
    ),
    planned_launch_count: jsonInt(
      source,
      "planned_launch_count",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.planned_launch_count
    ),
    target_launch_month: jsonIntOrNull(
      source,
      "target_launch_month",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.target_launch_month
    ),
    target_launch_year: jsonIntOrNull(
      source,
      "target_launch_year",
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.target_launch_year
    ),
  };
}

// L5 (#224): the baseline forecast no longer exposes controls for ANY of the
// silently-defaulted inputs — expected growth, growth date, average group size,
// launch buffer, and leaders per new group. Existing rows can still carry stale
// values (the seed alone stores growth 20 / size 10, and a church may have saved
// a custom buffer/leaders via the old form), and the decoder prefers a stored
// value over the default, so reset every hidden field here for the baseline
// forecast: compute as if those keys were unset. Storage is untouched (no
// migration); scenarios keep their own explicit values and are NOT passed through
// this. Only the two ministry-specific inputs (current church attendance, target
// participation) and the scenario-only launch-plan fields are preserved. Size's
// fallback chain mirrors `decodeLaunchPlanningAssumptions` (ministry default
// capacity, then the built-in) so "size = default capacity" tracks Settings
// rather than freezing a number.
export function applyBaselineSilentDefaults(
  assumptions: LaunchPlanningAssumptions,
  metricDefaults?: Pick<MetricDefaults, "default_group_capacity"> | null
): LaunchPlanningAssumptions {
  const defaultGroupSize =
    metricDefaults?.default_group_capacity != null &&
    metricDefaults.default_group_capacity > 0
      ? metricDefaults.default_group_capacity
      : BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.average_group_size;
  return {
    ...assumptions,
    expected_growth: BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth,
    expected_growth_date:
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth_date,
    average_group_size: defaultGroupSize,
    launch_buffer_pct: BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.launch_buffer_pct,
    leaders_per_new_group:
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.leaders_per_new_group,
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

type GroupForInputs = Pick<GroupsRow, "id" | "lifecycle_status" | "capacity">;

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

type MembershipForInputs = Pick<GroupMembershipsRow, "group_id" | "status">;

export function buildLaunchPlanningInputs(args: {
  groups: readonly GroupForInputs[];
  overrides: readonly OverrideForInputs[];
  memberships: readonly MembershipForInputs[];
  metricDefaults: MetricDefaults;
}): LaunchPlanningInputs {
  const overridesByGroup = indexOverridesByGroup(args.overrides);
  const activeMembershipCounts = countActiveMembersByGroup(args.memberships);

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
      args.metricDefaults
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
    effectiveTotalCapacity - currentParticipants
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
// Returns null if the input doesn't parse. This wraps the canonical
// `subtractDaysIso` from church-time with a strict format gate so a malformed
// string can't slide through Date's forgiving parser (ISO-8601 calendar date
// only) — a stronger contract than the always-string canonical helper.
function subtractDaysIso(iso: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if (!Number.isFinite(new Date(`${iso}T00:00:00Z`).getTime())) return null;
  return subtractDaysIsoUnchecked(iso, days);
}

export function computeLaunchPlan(
  assumptions: LaunchPlanningAssumptions,
  inputs: Pick<LaunchPlanningInputs, "effective_total_capacity">
): LaunchPlanningOutputs {
  // expected_growth can legitimately be negative (shrinkage), but the
  // *projected attendance* and *demand* must stay non-negative — a
  // projected -400 attendees is meaningless and would propagate to a
  // negative demand / oversized capacity gap in the UI. Clamp at zero
  // so the forecast stays physically meaningful even at the extremes.
  const projectedTotalAttendance = clampNonNegative(
    assumptions.current_church_attendance + assumptions.expected_growth
  );

  const participationPct = Math.min(
    1,
    Math.max(0, assumptions.target_group_participation_pct)
  );
  const projectedGroupDemand = clampNonNegative(
    projectedTotalAttendance * participationPct
  );

  const bufferPct = Math.min(
    // Never let the (1 - bufferPct) denominator reach zero. The RPC
    // caps at 0.95; clamp here too so a stale payload from disk can't
    // produce Infinity.
    0.95,
    Math.max(0, assumptions.launch_buffer_pct)
  );
  const targetCapacityWithBuffer = projectedGroupDemand / (1 - bufferPct);

  const capacityGap =
    targetCapacityWithBuffer - inputs.effective_total_capacity;

  // `average_group_size` is validated >= 1 at the RPC and validator, but
  // we still defend against a 0/negative slipping in from a hand-rolled
  // payload — fall back to 1 so we never divide by zero.
  const avgGroupSize = Math.max(1, Math.floor(assumptions.average_group_size));
  const recommendedNewGroups = Math.ceil(
    clampNonNegative(capacityGap) / avgGroupSize
  );

  const leadersPerNewGroup = Math.max(
    0,
    Math.floor(assumptions.leaders_per_new_group)
  );
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
  planned_launch_count: number;
  target_launch_month: number | null;
  target_launch_year: number | null;
};

export function redactNotesForAudit(
  assumptions: LaunchPlanningAssumptions
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
      typeof assumptions.notes === "string" &&
      assumptions.notes.trim().length > 0,
    planned_launch_count: assumptions.planned_launch_count,
    target_launch_month: assumptions.target_launch_month,
    target_launch_year: assumptions.target_launch_year,
  };
}

// ---------------------------------------------------------------------------
// #186 — Staffing supply vs demand (the leader gap)
// ---------------------------------------------------------------------------
//
// Capacity supply (seats) and staffing supply (leaders) are DIFFERENT
// constraints and are reported on their own axes — never summed (PRD §3.4).
// This block owns the staffing axis: how many leaders a planned launch needs,
// how many apprentices will be Ready by the target date, and the gap.

// Resolve the scenario's target launch date as YYYY-MM-DD. Prefers an explicit
// month + year; falls back to the next occurrence of the season month when only
// the month is set; null when no season is chosen. Reuses nextSeasonAnchorIso
// for the Aug/Jan anchors.
export function scenarioTargetDateIso(
  assumptions: Pick<
    LaunchPlanningAssumptions,
    "target_launch_month" | "target_launch_year"
  >,
  today: Date = new Date()
): string | null {
  const month = assumptions.target_launch_month;
  if (month !== 1 && month !== 8) return null;
  const year = assumptions.target_launch_year;
  if (year != null) {
    return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  }
  return nextSeasonAnchorIso(month, today);
}

// The staffing axis of the forecast. Demand uses the SAME unit as the rest of
// the model — launch count × leaders_per_new_group (default 2) — so "launch 3"
// needs 6 leaders, not 3 (§3.4, §9-f). Supply is the apprentices Ready (or
// projected Ready) by the target date. Gap = demand − supply, in leaders; a
// negative gap is a surplus.
export type StaffingForecast = {
  plannedLaunchCount: number;
  leadersPerNewGroup: number;
  targetDateIso: string | null;
  // Leaders needed for the planned launches.
  demand: number;
  // Apprentices Ready (or projected Ready) by the target date.
  supply: number;
  // demand − supply. Positive = short; negative = surplus.
  gap: number;
  // Convenience: max(0, gap) — the "short N" figure.
  shortfall: number;
};

// An apprentice's stage + expected-ready date, the only fields staffing supply
// needs. Matches the pure shape in lib/admin/leader-pipeline.
export type StaffingApprentice = {
  stage: LeaderReadinessStage;
  expectedReadyOn: string | null;
};

export function computeStaffingForecast(args: {
  plannedLaunchCount: number;
  leadersPerNewGroup: number;
  staffingSupply: number;
}): Omit<StaffingForecast, "targetDateIso"> {
  const launches = Math.max(0, Math.floor(args.plannedLaunchCount));
  const perGroup = Math.max(0, Math.floor(args.leadersPerNewGroup));
  const supply = Math.max(0, Math.floor(args.staffingSupply));
  const demand = launches * perGroup;
  const gap = demand - supply;
  return {
    plannedLaunchCount: launches,
    leadersPerNewGroup: perGroup,
    demand,
    supply,
    gap,
    shortfall: Math.max(0, gap),
  };
}

// Count apprentices that are (or are projected to be) Ready to lead by the
// target date. When there is no target date, only those Ready *today* count
// (an open-ended plan can't bank on a future projection).
export function countStaffingSupply(
  apprentices: readonly StaffingApprentice[],
  targetDateIso: string | null
): number {
  // No target date: "today" is the only date we can measure projections
  // against, so only currently-Ready apprentices count.
  const asOf = targetDateIso ?? "0000-00-00";
  let count = 0;
  for (const a of apprentices) {
    if (targetDateIso == null) {
      if (a.stage === "ready_to_lead") count += 1;
    } else if (apprenticeReadyBy(a, asOf)) {
      count += 1;
    }
  }
  return count;
}

// Tie the scenario's launch plan to the live pipeline: derive the target date,
// count the apprentices Ready by then, and compute the leader gap. This is the
// number today's tool can't show because it has no pipeline to count.
export function buildStaffingForecast(
  assumptions: Pick<
    LaunchPlanningAssumptions,
    | "planned_launch_count"
    | "leaders_per_new_group"
    | "target_launch_month"
    | "target_launch_year"
  >,
  apprentices: readonly StaffingApprentice[],
  today: Date = new Date()
): StaffingForecast {
  const targetDateIso = scenarioTargetDateIso(assumptions, today);
  const supply = countStaffingSupply(apprentices, targetDateIso);
  const core = computeStaffingForecast({
    plannedLaunchCount: assumptions.planned_launch_count,
    leadersPerNewGroup: assumptions.leaders_per_new_group,
    staffingSupply: supply,
  });
  return { ...core, targetDateIso };
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
  metricDefaults?: Parameters<typeof decodeLaunchPlanningAssumptions>[1]
): LaunchPlanningScenario {
  const assumptions = decodeLaunchPlanningAssumptions(
    {
      id: row.id,
      setting_key: "launch_planning_scenarios.assumptions",
      setting_value: row.assumptions,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as AppSettingsRow,
    metricDefaults
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
  scenarios: readonly T[]
): T[] {
  return scenarios.filter((s) => s.archived_at == null);
}

export function findCurrentScenario(
  scenarios: readonly LaunchPlanningScenario[]
): LaunchPlanningScenario | null {
  return scenarios.find((s) => s.is_current && s.status === "active") ?? null;
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
  inputs: Pick<LaunchPlanningInputs, "effective_total_capacity">
): LaunchPlanningScenarioComparisonEntry[] {
  return scenarios.map((scenario) => ({
    scenario,
    outputs: computeLaunchPlan(scenario.assumptions, inputs),
  }));
}

// Julian P2 (answer 9): "% of the church in a life group" — current people in
// groups over the latest known church attendance. Returns null when no
// denominator is available so the UI can show "—" instead of a bogus 0%.
export function participationPct(
  currentParticipants: number,
  churchAttendance: number | null
): number | null {
  if (churchAttendance == null || churchAttendance <= 0) return null;
  return Math.round((currentParticipants / churchAttendance) * 100);
}

// ---------------------------------------------------------------------------
// L5 (#224) — percent ⇄ ratio at the UI boundary
// ---------------------------------------------------------------------------
//
// Storage keeps participation and launch-buffer as 0–1 ratios, so no migration
// is required. The forecast and scenario forms show and accept whole-number
// percentages instead of decimals; these two pure helpers do the conversion and
// are shared by the client form fields (see components/.../percent-field.tsx).

// A 0–1 ratio → the percent string shown in the input (e.g. 0.6 → "60").
// Preserves a fractional part so a hand-set value like 0.625 round-trips as
// 62.5 rather than truncating to 63.
export function ratioToPercent(ratio: number): string {
  const pct = ratio * 100;
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(1).replace(/\.0$/, "");
}

// The percent string from the input → the ratio string the server stores
// (e.g. "60" → "0.6"). A blank stays blank so the form's "leave unchanged"
// (baseline) and required (scenario) semantics are preserved, and a
// non-numeric entry is passed through unchanged so the server validator — not
// this helper — owns the rejection message. The `/100` is rounded to 6 decimals
// before stringifying so it can't surface a binary-float artifact
// (`0.33299999999999996`) or scientific notation (`5e-7`) — the server
// validator only accepts plain decimal strings, and 6 decimals (0.0001%) is far
// finer than any ratio this UI produces.
export function percentToRatio(percent: string): string {
  const trimmed = percent.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  return String(Number((n / 100).toFixed(6)));
}

// Julian P3 (answer 11): his planting seasons are August (primary) and
// January. Returns the next occurrence of the 1st of the given month as
// YYYY-MM-DD relative to `today` (UTC), so the launch-planning growth-date
// field can be quick-filled to the upcoming planting season.
export type PlantingSeasonMonth = 1 | 8;

export function nextSeasonAnchorIso(
  month: PlantingSeasonMonth,
  today: Date = new Date()
): string {
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const thisYear = today.getUTCFullYear();
  const candidate = Date.UTC(thisYear, month - 1, 1);
  const year = candidate >= todayUtc ? thisYear : thisYear + 1;
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}
