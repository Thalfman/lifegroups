import { P } from "@/lib/pastoral";
import { MetricCard } from "@/components/dashboard/cards";
import type { AdminSummary } from "@/lib/dashboard/types";

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function SummaryCards({ summary }: { summary: AdminSummary }) {
  const missingMeta =
    summary.missingCheckIns === 0
      ? "Every active group is in for the week"
      : `${summary.missingCheckIns} ${plural(summary.missingCheckIns, "group hasn't", "groups haven't")} checked in`;
  const submittedMeta =
    summary.activeGroupCount === 0
      ? "No active groups yet"
      : `${summary.submittedCheckIns} of ${summary.activeGroupCount} active groups`;
  const followUpMeta =
    summary.needsFollowUp === 0
      ? "Quiet week on the pulse"
      : `${plural(summary.needsFollowUp, "Group flagged", "Groups flagged")} for follow-up`;
  const capacityMeta =
    summary.capacityWatch === 0
      ? "No groups at or near the threshold"
      : `${plural(summary.capacityWatch, "Group at or near", "Groups at or near")} capacity`;
  const unknownMeta =
    summary.unknownCapacity === 0
      ? "Every group has a capacity set"
      : `${plural(summary.unknownCapacity, "Group missing", "Groups missing")} a capacity value`;

  return (
    <section aria-labelledby="weekly-overview">
      <h2 id="weekly-overview" className="sr-only">
        Weekly overview
      </h2>
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <MetricCard
          title="Active groups"
          value={String(summary.activeGroupCount)}
          meta="Open Life Groups in the directory"
          accent={P.sage}
        />
        <MetricCard
          title="Submitted check-ins"
          value={String(summary.submittedCheckIns)}
          meta={submittedMeta}
          accent={P.ink}
          valueColor={P.ink}
        />
        <MetricCard
          title="Missing check-ins"
          value={String(summary.missingCheckIns)}
          meta={missingMeta}
          accent={P.terra}
          valueColor={summary.missingCheckIns > 0 ? P.terra : P.ink}
        />
        <MetricCard
          title="Needs follow-up"
          value={String(summary.needsFollowUp)}
          meta={followUpMeta}
          accent={P.mustard}
          valueColor={summary.needsFollowUp > 0 ? P.mustard : P.ink}
        />
        <MetricCard
          title="Capacity watch"
          value={String(summary.capacityWatch)}
          meta={capacityMeta}
          accent={P.terra}
          valueColor={summary.capacityWatch > 0 ? P.terra : P.ink}
        />
        <MetricCard
          title="Unknown capacity"
          value={String(summary.unknownCapacity)}
          meta={unknownMeta}
          accent={P.ink3}
          valueColor={P.ink}
        />
      </div>
    </section>
  );
}
