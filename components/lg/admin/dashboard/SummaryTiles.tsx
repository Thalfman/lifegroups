import { SummaryCard } from "@/components/lg/SummaryCard";
import type { AdminSummary } from "@/lib/dashboard/types";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function SummaryTiles({ summary }: { summary: AdminSummary }) {
  const submittedHint =
    summary.activeGroupCount === 0 ? "—" : `of ${summary.activeGroupCount}`;
  const missingHint =
    summary.missingCheckIns === 0 ? "All in for the week" : "past due";
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
      className="lg-shell-grid-6"
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      }}
    >
      <SummaryCard
        label="Active groups"
        value={summary.activeGroupCount}
        tone="sage"
        trend={groupsTrend}
      />
      <SummaryCard
        label="Submitted check-ins"
        value={summary.submittedCheckIns}
        tone="sage"
        hint={submittedHint}
      />
      <SummaryCard
        label="Missing check-ins"
        value={summary.missingCheckIns}
        tone={summary.missingCheckIns > 0 ? "rose" : "sage"}
        hint={missingHint}
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
