import { StatusCard, EmptyState } from "@/components/dashboard/cards";
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
        eyebrow="Shepherd care"
        title="Care triage"
        action={
          <OpenLink href="/admin/shepherd-care" label="Contact shepherds" />
        }
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
        ? "1 shepherd in the attention queue."
        : `${summary.attentionItemsTotal} shepherds in the attention queue.`;

  return (
    <StatusCard
      eyebrow="Shepherd care"
      title="Care triage"
      action={
        <OpenLink href="/admin/shepherd-care" label="Contact shepherds" />
      }
    >
      {summary.error ? (
        <p className="m-0 mb-3 rounded-[8px] border border-clay bg-claySoft px-2.5 py-2 font-sans text-[12.5px] text-clayDeep">
          Coverage data couldn’t be loaded. Unassigned-coverage is hidden until
          this clears.
        </p>
      ) : null}
      <StatTileGrid>
        <StatTile
          label="Needs attention"
          value={summary.needsAttention}
          hint={`of ${summary.totalActiveShepherds}`}
          valueClassName={summary.needsAttention > 0 ? "text-clay" : "text-ink"}
        />
        <StatTile
          label="Overdue touchpoints"
          value={summary.overdueTouchpoints}
          valueClassName={
            summary.overdueTouchpoints > 0 ? "text-clay" : "text-ink"
          }
        />
        <StatTile
          label="Stale contact"
          value={summary.notContactedRecently}
          valueClassName={
            summary.notContactedRecently > 0 ? "text-amber" : "text-ink"
          }
        />
        {summary.coverageAvailable ? (
          <StatTile
            label="Unassigned coverage"
            value={summary.unassignedCoverage}
            valueClassName={
              summary.unassignedCoverage > 0 ? "text-amber" : "text-ink"
            }
          />
        ) : null}
        <StatTile
          label="Over-shepherds"
          value={summary.activeOverShepherds ?? "—"}
        />
      </StatTileGrid>
      <p className="m-0 mt-3.5 font-sans text-[12.5px] text-ink3">{footer}</p>
    </StatusCard>
  );
}
