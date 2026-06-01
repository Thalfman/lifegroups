import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { launchRiskDisplay } from "./overview-primitives";

// The executive "vital signs" — the at-a-glance state of the ministry, in the
// warm pastoral MetricCard language used across the other admin tabs. These are
// point-in-time (current state); they don't change with the period slicer.
export function VitalSignsBand({ data }: { data: AdminDashboardData }) {
  const { launchPlanning: lp, shepherdCare: care, summary } = data;

  const participation =
    lp.participationPct == null ? null : `${lp.participationPct}%`;

  const capacityUsedPct =
    lp.effectiveTotalCapacity > 0
      ? Math.round((lp.currentParticipants / lp.effectiveTotalCapacity) * 100)
      : null;

  const risk = launchRiskDisplay(lp.riskLevel);

  // When launch-planning data is unavailable the snapshot degrades to zeros;
  // show "—" rather than rendering those zeros as real figures (the launch
  // card already says the data is unavailable).
  const planning = lp.available;
  const participationMeta = !planning
    ? "Planning data unavailable"
    : participation == null
      ? "Set church attendance in Launch planning"
      : `${lp.currentParticipants} of ${lp.currentChurchAttendance} attending`;
  const participationValue = !planning ? "—" : (participation ?? "Not set");
  const leadersMeta = !care.available
    ? "Care data unavailable"
    : care.activeOverShepherds == null
      ? "Coverage data unavailable"
      : `${care.activeOverShepherds} over-shepherds`;

  return (
    <section aria-labelledby="exec-vital-signs">
      <h2 id="exec-vital-signs" className="sr-only">
        Ministry vital signs
      </h2>
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
        }}
      >
        <MetricCard
          title="% of church in groups"
          value={participationValue}
          empty={!planning || participation == null}
          meta={participationMeta}
          accent={P.sage}
          valueColor={P.sageTextStrong}
        />
        <MetricCard
          title="Active groups"
          value={String(summary.activeGroupCount)}
          meta="Currently meeting"
          accent={P.sage}
          valueColor={P.ink}
        />
        <MetricCard
          title="People in groups"
          value={planning ? String(lp.currentParticipants) : "—"}
          empty={!planning}
          meta={planning ? "Active participants" : "Planning data unavailable"}
          accent={P.sage}
          valueColor={P.ink}
        />
        <MetricCard
          title="Active leaders"
          value={care.available ? String(care.totalActiveShepherds) : "—"}
          empty={!care.available}
          meta={leadersMeta}
          accent={P.sage}
          valueColor={P.ink}
        />
        <MetricCard
          title="Capacity used"
          value={capacityUsedPct == null ? "—" : `${capacityUsedPct}%`}
          empty={capacityUsedPct == null}
          meta={
            capacityUsedPct == null
              ? "No capacity configured"
              : `${lp.currentParticipants} of ${lp.effectiveTotalCapacity} seats`
          }
          accent={
            capacityUsedPct != null && capacityUsedPct >= 85
              ? P.mustard
              : P.sage
          }
          valueColor={
            capacityUsedPct != null && capacityUsedPct >= 85
              ? P.mustardTextStrong
              : P.ink
          }
        />
        <MetricCard
          title="Launch outlook"
          value={lp.available ? risk.label : "—"}
          meta={
            lp.available
              ? lp.recommendedNewGroups > 0
                ? `Recommend ${lp.recommendedNewGroups} new ${lp.recommendedNewGroups === 1 ? "group" : "groups"}`
                : "Capacity holds for now"
              : "Planning data unavailable"
          }
          accent={risk.tone}
          valueColor={risk.tone}
        />
      </div>
    </section>
  );
}
