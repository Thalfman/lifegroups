import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import type { ShepherdCareDashboardSummary } from "@/lib/dashboard/types";
import { OpenLink, StatTile, StatTileGrid } from "./overview-primitives";

// Executive overview of leader (shepherd) care. Reuses the same counts the deep
// /admin/shepherd-care page derives, re-skinned warm. Replaces the former
// near-white ShepherdCareTriageCard.
export function LeaderCareOverviewCard({
  summary,
}: {
  summary: ShepherdCareDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <StatusCard
        eyebrow="Leader care"
        title="Care triage"
        action={<OpenLink href="/admin/shepherd-care" />}
      >
        <EmptyState
          title="Care data unavailable"
          description={
            summary.error ?? "The care directory could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  const footer =
    summary.attentionItemsTotal === 0
      ? "Care queue is clear."
      : summary.attentionItemsTotal === 1
        ? "1 leader in the attention queue."
        : `${summary.attentionItemsTotal} leaders in the attention queue.`;

  return (
    <StatusCard
      eyebrow="Leader care"
      title="Care triage"
      action={<OpenLink href="/admin/shepherd-care" />}
    >
      <StatTileGrid>
        <StatTile
          label="Needs attention"
          value={summary.needsAttention}
          hint={`of ${summary.totalActiveShepherds}`}
          valueColor={summary.needsAttention > 0 ? P.terra : P.ink}
        />
        <StatTile
          label="Overdue touchpoints"
          value={summary.overdueTouchpoints}
          valueColor={summary.overdueTouchpoints > 0 ? P.terra : P.ink}
        />
        <StatTile
          label="Stale contact"
          value={summary.notContactedRecently}
          valueColor={summary.notContactedRecently > 0 ? P.mustard : P.ink}
        />
        {summary.coverageAvailable ? (
          <StatTile
            label="Unassigned coverage"
            value={summary.unassignedCoverage}
            valueColor={summary.unassignedCoverage > 0 ? P.mustard : P.ink}
          />
        ) : null}
        <StatTile label="Over-shepherds" value={summary.activeOverShepherds} />
      </StatTileGrid>
      <p
        style={{
          margin: "14px 0 0",
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink3,
        }}
      >
        {footer}
      </p>
    </StatusCard>
  );
}
