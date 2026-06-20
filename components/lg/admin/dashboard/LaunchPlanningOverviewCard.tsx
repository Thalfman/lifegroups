import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontSans } from "@/lib/pastoral";
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

function RiskPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        background: `${tone}22`,
        color: tone,
        fontFamily: fontSans,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0,
      }}
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
      <div style={{ marginBottom: 12 }}>
        <RiskPill label={risk.label} tone={risk.tone} />
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
          valueColor={gap > 0 ? P.terra : P.sage}
        />
        <StatTile
          label="Recommend new"
          value={snapshot.recommendedNewGroups}
          valueColor={snapshot.recommendedNewGroups > 0 ? P.mustard : P.ink}
        />
      </StatTileGrid>

      <CandidateCountsLine
        eyebrow="Multiplication"
        multiplication={multiplication}
      />
    </StatusCard>
  );
}
