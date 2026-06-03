import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { CANDIDATE_STATUS_LABEL } from "@/lib/admin/multiplication";
import type { MultiplicationCandidateStatus } from "@/types/enums";
import type {
  LaunchPlanningDashboardSnapshot,
  MultiplicationDashboardSummary,
} from "@/lib/dashboard/types";
import {
  OpenLink,
  StatTile,
  StatTileGrid,
  launchRiskDisplay,
} from "./overview-primitives";

const MULTIPLICATION_ORDER: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

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
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}

// Executive overview of capacity & launch outlook, with a compact
// multiplication-candidate line (multiplication lives on /admin/launch-planning
// per ADR 0010). Reuses the dashboard's launch snapshot so it matches the deep
// page. Replaces the former near-white LaunchPlanningSnapshotCard.
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
          <OpenLink href="/admin/launch-planning" label="View launch plan" />
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
        <OpenLink href="/admin/launch-planning" label="View launch plan" />
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

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${P.line2}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1.3,
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Multiplication
        </span>
        {/* Render an explicit unavailable note rather than dropping the section,
            so a failed read doesn't read as "no candidates". */}
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: multiplication.available ? P.ink2 : P.ink3,
            fontStyle: multiplication.available ? "normal" : "italic",
          }}
        >
          {multiplication.available
            ? MULTIPLICATION_ORDER.map(
                (s, i) =>
                  `${CANDIDATE_STATUS_LABEL[s]} ${multiplication.counts[s]}${
                    i < MULTIPLICATION_ORDER.length - 1 ? "  ·  " : ""
                  }`
              ).join("")
            : "Data unavailable"}
        </span>
      </div>
    </StatusCard>
  );
}
