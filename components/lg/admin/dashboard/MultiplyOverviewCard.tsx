import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import type {
  MultiplicationDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import {
  CandidateCountsLine,
  CardNote,
  OpenLink,
  StatTile,
  StatTileGrid,
} from "./overview-primitives";

// Multiplication overview (#470, ADR 0019/0021/0022): "X of Y cells ready"
// from the per-cell readiness signal, plus the planner's candidate counts,
// drilling into /admin/multiply. The readiness summary is built purely over
// the same Multiply grid the deep surface renders (buildMultiplyHomeSummary),
// so Home can never disagree with it. A failed grid read flips available:false
// and the whole card degrades to an unavailable state — never a false
// "0 of 0 ready". The candidate footer carries its own availability, mirroring
// the Capacity & launch card's multiplication line.
export function MultiplyOverviewCard({
  summary,
  multiplication,
}: {
  summary: MultiplyReadinessDashboardSummary;
  multiplication: MultiplicationDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <StatusCard
        eyebrow="Multiply"
        title="Multiplication readiness"
        action={<OpenLink href="/admin/multiply" label="Review readiness" />}
      >
        <EmptyState
          title="Readiness data unavailable"
          description={
            summary.error ?? "Group-type readiness could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  return (
    <StatusCard
      eyebrow="Multiply"
      title="Multiplication readiness"
      action={<OpenLink href="/admin/multiply" label="Review readiness" />}
    >
      {summary.activeCells === 0 ? (
        <CardNote>
          No active group types yet — readiness will gather here once group
          types are set up in Settings.
        </CardNote>
      ) : (
        <StatTileGrid>
          <StatTile
            label="Groups ready"
            value={summary.readyCells}
            valueClassName={summary.readyCells > 0 ? "text-sage" : "text-ink"}
            hint={`of ${summary.activeCells}`}
          />
        </StatTileGrid>
      )}

      <CandidateCountsLine eyebrow="Planner" multiplication={multiplication} />
    </StatusCard>
  );
}
