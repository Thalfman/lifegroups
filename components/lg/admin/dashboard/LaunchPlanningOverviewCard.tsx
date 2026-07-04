import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import type {
  LaunchPlanningDashboardSnapshot,
  MultiplicationDashboardSummary,
} from "@/lib/dashboard/types";
import {
  CandidateCountsLine,
  OpenLink,
  StatTile,
  StatTileGrid,
  launchRiskDisplay,
} from "./overview-primitives";

function RiskPill({
  label,
  toneTextClassName,
}: {
  label: string;
  toneTextClassName: string;
}) {
  return (
    <span
      className={`inline-block rounded-pill px-2.5 py-[3px] font-sans text-xs font-semibold ${toneTextClassName}`}
    >
      {label}
    </span>
  );
}

// Executive overview of capacity & launch outlook, with a compact
// multiplication-candidate line. The "View launch plan" action opens the
// visible Multiply Pipeline tab (/admin/multiply?tab=pipeline) — ADR 0022
// re-homed the planner there and ADR 0030 renamed the tab from "Plan"; the
// frozen /admin/launch-planning shell still resolves by direct URL but is no
// longer a link target. Reuses the dashboard's launch
// snapshot so it matches the deep page. Replaces the former near-white
// LaunchPlanningSnapshotCard.
export function LaunchPlanningOverviewCard({
  snapshot,
  multiplication,
}: {
  snapshot: LaunchPlanningDashboardSnapshot;
  multiplication: MultiplicationDashboardSummary;
}) {
  if (!snapshot.available) {
    return (
      <StatusCard
        eyebrow="Launch planning"
        title="Capacity & launch"
        action={
          <OpenLink
            href="/admin/multiply?tab=pipeline"
            label="View launch plan"
          />
        }
      >
        <EmptyState
          title="Planning data unavailable"
          description={
            snapshot.error ?? "Launch-planning data could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  const risk = launchRiskDisplay(snapshot.riskLevel);
  const gap = Math.round(snapshot.capacityGap);

  return (
    <StatusCard
      eyebrow="Launch planning"
      title="Capacity & launch"
      action={
        <OpenLink href="/admin/multiply?tab=plan" label="View launch plan" />
      }
    >
      <div className="mb-3">
        <RiskPill
          label={risk.label}
          toneTextClassName={risk.toneTextClassName}
        />
      </div>
      <StatTileGrid>
        <StatTile
          label="Effective capacity"
          value={snapshot.effectiveTotalCapacity}
        />
        <StatTile label="In groups now" value={snapshot.currentParticipants} />
        <StatTile
          label={gap > 0 ? "Capacity gap" : "Headroom"}
          value={Math.abs(gap)}
          valueClassName={gap > 0 ? "text-clay" : "text-sage"}
        />
        <StatTile
          label="Recommend new"
          value={snapshot.recommendedNewGroups}
          valueClassName={
            snapshot.recommendedNewGroups > 0 ? "text-amber" : "text-ink"
          }
        />
      </StatTileGrid>

      <CandidateCountsLine
        eyebrow="Multiplication"
        multiplication={multiplication}
      />
    </StatusCard>
  );
}
