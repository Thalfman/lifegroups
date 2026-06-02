// Launch-planning snapshot for the /admin landing card.
//
// This is the read-dependent "spine" projection that turns the dashboard's
// derived group rows + the stored launch-planning assumptions into the
// headline launch card (effective capacity, current participants, the
// recommended-launch forecast, and the church-participation figure).
//
// It lives here — not inside buildAdminGroupModel — because it consumes its
// own assumptions read and degrades to an explicit `available:false` state on
// a failed read, which is a read concern the pure assembler deliberately does
// not own (see lib/dashboard/admin-group-model.ts and ADR-0011). It is split
// out of queries.ts so BOTH the live orchestration and the demo fallback seed
// (lib/dashboard/demo-seed.ts) derive the launch snapshot from one function —
// the demo can't drift from the live card's shape or its forecast rules.

import type { LaunchPlanningDashboardSnapshot } from "./types";
import type { DerivedGroupRow } from "./admin-group-model";
import {
  applyBaselineSilentDefaults,
  buildLaunchPlanningInputs,
  computeLaunchPlan,
  decodeLaunchPlanningAssumptions,
  participationPct,
} from "@/lib/admin/launch-planning";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { AppSettingsRow } from "@/types/database";
import type { ReadResult } from "@/lib/supabase/read-models";

export function buildLaunchPlanningSnapshot(
  assumptionsRes: ReadResult<AppSettingsRow | null>,
  derivedRows: DerivedGroupRow[],
  defaults: MetricDefaults
): LaunchPlanningDashboardSnapshot {
  // Failed assumption reads (transient DB/RLS) must surface as an
  // explicit "unavailable" state — otherwise the dashboard quietly
  // recommends a launch plan against built-in defaults while
  // /admin/launch-planning shows an error banner. The two surfaces must
  // not contradict each other.
  if (assumptionsRes.error) {
    return emptyLaunchPlanningSnapshot(assumptionsRes.error.message);
  }
  const assumptionsAvailable = assumptionsRes.data != null;
  // decodeLaunchPlanningAssumptions(null, defaults) already folds the
  // configured metric defaults (e.g. default_group_capacity ->
  // average_group_size) into the fallback, matching what
  // /admin/launch-planning uses. applyBaselineSilentDefaults then normalizes the
  // baseline-only silently-defaulted inputs (growth 0, size = default capacity,
  // buffer/leaders to defaults) EXACTLY as the deep page does (#224), so a seeded
  // row carrying growth=20 / size=10 can't make this card contradict the page.
  const assumptions = applyBaselineSilentDefaults(
    decodeLaunchPlanningAssumptions(assumptionsRes.data ?? null, defaults),
    defaults
  );
  const inputs = buildLaunchPlanningInputs({
    groups: derivedRows.map((r) => r.group),
    overrides: derivedRows
      .map((r) => r.override)
      .filter((o): o is NonNullable<typeof o> => o !== null),
    memberships: derivedRows.flatMap((r) =>
      Array.from({ length: r.activeMemberCount }, () => ({
        group_id: r.group.id,
        status: "active" as const,
      }))
    ),
    metricDefaults: defaults,
  });
  const outputs = computeLaunchPlan(assumptions, inputs);
  return {
    effectiveTotalCapacity: inputs.effective_total_capacity,
    currentParticipants: inputs.current_participants,
    projectedGroupDemand: outputs.projected_group_demand,
    capacityGap: outputs.capacity_gap,
    recommendedNewGroups: outputs.recommended_new_groups,
    estimatedNewLeadersNeeded: outputs.estimated_new_leaders_needed,
    riskLevel: outputs.risk_level,
    suggestedLaunchByDate: outputs.suggested_launch_by_date,
    unknownCapacityGroupCount: inputs.unknown_capacity_group_count,
    excludedActiveGroupCount: inputs.excluded_active_group_count,
    // Participation uses the editable church-attendance assumption as its
    // denominator (via participationPct) — the same source /admin/launch-planning
    // uses — so the landing's "% in groups" never disagrees with that page.
    currentChurchAttendance: assumptions.current_church_attendance,
    participationPct: participationPct(
      inputs.current_participants,
      assumptions.current_church_attendance
    ),
    assumptionsAvailable,
    available: true,
    error: null,
  };
}

export function emptyLaunchPlanningSnapshot(
  errorMessage: string
): LaunchPlanningDashboardSnapshot {
  return {
    effectiveTotalCapacity: 0,
    currentParticipants: 0,
    projectedGroupDemand: 0,
    capacityGap: 0,
    recommendedNewGroups: 0,
    estimatedNewLeadersNeeded: 0,
    riskLevel: "ok",
    suggestedLaunchByDate: null,
    unknownCapacityGroupCount: 0,
    excludedActiveGroupCount: 0,
    currentChurchAttendance: 0,
    participationPct: null,
    assumptionsAvailable: false,
    available: false,
    error: errorMessage,
  };
}
