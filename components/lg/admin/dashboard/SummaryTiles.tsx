import { SummaryCard } from "@/components/lg/SummaryCard";
import type { AdminSummary } from "@/lib/dashboard/types";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// Shepherd→admin reporting loop removed per
// docs/adr/0002-oversight-ladder-and-leader-gating.md: the "Submitted
// check-ins" and "Missing check-ins" tiles were the dashboard's
// attendance-rhythm read of the now-gated leader check-in. They are dropped
// here (the underlying counts stay dormant on AdminSummary). The remaining
// four operational tiles render in a 4-up grid.
export function SummaryTiles({ summary }: { summary: AdminSummary }) {
  const followUpHint =
    summary.needsFollowUp === 0 ? "Quiet week" : "from leader pulse";
  const capacityHint =
    summary.capacityWatch === 0 ? "below threshold" : "80%+ full";
  const unknownHint =
    summary.unknownCapacity === 0 ? "all set" : "set a ceiling";
  const groupsTrend = `${summary.activeGroupCount} active ${plural(
    summary.activeGroupCount,
    "group",
    "groups",
  )}`;

  return (
    <div
      className="lg-shell-grid-4"
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      }}
    >
      <SummaryCard
        label="Active groups"
        value={summary.activeGroupCount}
        tone="sage"
        trend={groupsTrend}
      />
      <SummaryCard
        label="Needs follow-up"
        value={summary.needsFollowUp}
        tone={summary.needsFollowUp > 0 ? "amber" : "sage"}
        hint={followUpHint}
      />
      <SummaryCard
        label="Capacity watch"
        value={summary.capacityWatch}
        tone={summary.capacityWatch > 0 ? "clay" : "sage"}
        hint={capacityHint}
      />
      <SummaryCard
        label="Unknown capacity"
        value={summary.unknownCapacity}
        tone="neutral"
        hint={unknownHint}
      />
    </div>
  );
}
