import { P } from "@/lib/pastoral";
import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { ACTIVE_BOARD_STATES } from "@/lib/supabase/prospect-reads";
import { launchRiskDisplay } from "./overview-primitives";

// The executive "vital signs" — the at-a-glance state of the ministry. One
// bordered band of figures (2×3 on a phone) instead of a wall of identical
// stat cards: each cell is a sentence-case label, a serif figure, and a meta
// line. Point-in-time (current state); they don't change with the period
// slicer.
//
// Re-founded on the Care/Plan/Multiply pivot (ADR 0016/0022, #476): the band
// leads with six pivot signals — Active groups · Active leaders · Leaders
// needing care · Prospects in funnel · Cells ready to multiply · Follow-ups
// due this week. The funnel and readiness tiles reuse the same #470 summaries
// the overview cards render (fetchProspectStateCounts / the Multiply grid), so
// the band can never disagree with them.
//
// The four retired launch-planning metrics (% of church in groups, People in
// groups, Capacity used, Launch outlook) are NOT deleted — frozen-surface
// discipline: they render only when the Planning nav flag is re-shown
// (`showLaunchPlanning`, the same gate the LaunchPlanningOverviewCard uses)
// and return if the Super Admin re-shows Planning.
//
// Every cell degrades to "—" when its read failed — never a false zero: the
// care-backed cells key off `shepherdCare.available`, the funnel/readiness
// cells off their summaries' `available`, the launch cells off
// `launchPlanning.available`, and the dashboard-derived cells off `degraded`
// (the whole dashboard read fell back to demo data).

function VitalSign({
  title,
  value,
  meta,
  valueColor,
  empty = false,
}: {
  title: string;
  value: string;
  meta: string;
  valueColor?: string;
  empty?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface px-4 py-3.5">
      <div className="font-sans text-sm text-ink3">{title}</div>
      {empty ? (
        <div className="font-sans text-md font-semibold italic leading-tight text-ink3">
          {value}
        </div>
      ) : (
        <div
          className="font-display text-3xl tabular-nums leading-none"
          style={{ color: valueColor ?? P.ink }}
        >
          {value}
        </div>
      )}
      <div className="font-sans text-xs text-ink2">{meta}</div>
    </div>
  );
}

export function VitalSignsBand({
  data,
  interestFunnel,
  multiplyReadiness,
  showLaunchPlanning = true,
  degraded = false,
}: {
  data: AdminDashboardData;
  // Pivot overview summaries (#470/#476), loaded alongside the dashboard read
  // in app/(protected)/admin/page.tsx and degraded per-tile.
  interestFunnel: InterestFunnelDashboardSummary;
  multiplyReadiness: MultiplyReadinessDashboardSummary;
  // True only when /admin/planning is NOT nav-hidden (ADR 0016).
  showLaunchPlanning?: boolean;
  // True when the dashboard read failed and `data` is demo fallback; the
  // dashboard-derived cells degrade to "—" rather than presenting demo counts.
  degraded?: boolean;
}) {
  const { launchPlanning: lp, shepherdCare: care, summary } = data;

  const careOk = !degraded && care.available;
  const leadersMeta = !careOk
    ? "Care data unavailable"
    : care.activeOverShepherds == null
      ? "Coverage data unavailable"
      : `${care.activeOverShepherds} over-shepherds`;
  const needsCare = care.needsAttention;

  // Prospects currently being worked in the Interest Funnel — the three live
  // states; Joined is the collapsed roll-up, mirroring the Plan board's
  // partition (and the Interest Funnel overview card's own sum).
  const funnelOk = interestFunnel.available;
  const prospectsInFunnel = ACTIVE_BOARD_STATES.reduce(
    (sum, state) => sum + interestFunnel.counts[state],
    0
  );

  const readinessOk = multiplyReadiness.available;

  const dueThisWeek = data.dueFollowUpsThisWeekCount;

  // --- Retired launch-planning metrics (render only when Planning is shown) —
  // pre-pivot capacity-model figures, kept frozen rather than deleted. When
  // launch-planning data is unavailable the snapshot degrades to zeros; show
  // "—" rather than rendering those zeros as real figures.
  const planning = !degraded && lp.available;
  const participation =
    lp.participationPct == null ? null : `${lp.participationPct}%`;
  const capacityUsedPct =
    planning && lp.effectiveTotalCapacity > 0
      ? Math.round((lp.currentParticipants / lp.effectiveTotalCapacity) * 100)
      : null;
  const risk = launchRiskDisplay(lp.riskLevel);
  const participationMeta = !planning
    ? "Planning data unavailable"
    : participation == null
      ? "Set church attendance in Launch planning"
      : `${lp.currentParticipants} of ${lp.currentChurchAttendance} attending`;
  const participationValue = !planning ? "—" : (participation ?? "Not set");

  return (
    <section aria-labelledby="exec-vital-signs">
      <h2 id="exec-vital-signs" className="sr-only">
        Ministry vital signs
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <VitalSign
          title="Active groups"
          value={degraded ? "—" : String(summary.activeGroupCount)}
          empty={degraded}
          meta={degraded ? "Group data unavailable" : "Currently meeting"}
        />
        <VitalSign
          title="Active shepherds"
          value={careOk ? String(care.totalActiveShepherds) : "—"}
          empty={!careOk}
          meta={leadersMeta}
        />
        <VitalSign
          title="Shepherds needing care"
          value={careOk ? String(needsCare) : "—"}
          empty={!careOk}
          meta={
            !careOk
              ? "Care data unavailable"
              : needsCare > 0
                ? `of ${care.totalActiveShepherds} active shepherds`
                : "Care queue is clear"
          }
          valueColor={careOk && needsCare > 0 ? P.terraTextStrong : undefined}
        />
        <VitalSign
          title="Prospects in funnel"
          value={funnelOk ? String(prospectsInFunnel) : "—"}
          empty={!funnelOk}
          meta={
            funnelOk
              ? `${interestFunnel.counts.joined} joined a group`
              : "Funnel data unavailable"
          }
        />
        <VitalSign
          title="Groups ready to multiply"
          value={readinessOk ? String(multiplyReadiness.readyCells) : "—"}
          empty={!readinessOk}
          meta={
            !readinessOk
              ? "Readiness data unavailable"
              : multiplyReadiness.activeCells === 0
                ? "No active group types yet"
                : `of ${multiplyReadiness.activeCells} active group types`
          }
          valueColor={
            readinessOk && multiplyReadiness.readyCells > 0
              ? P.sageTextStrong
              : undefined
          }
        />
        <VitalSign
          title="Follow-ups due this week"
          value={degraded ? "—" : String(dueThisWeek)}
          empty={degraded}
          meta={
            degraded ? "Follow-up data unavailable" : "Due in the next 7 days"
          }
          valueColor={
            !degraded && dueThisWeek > 0 ? P.mustardTextStrong : undefined
          }
        />
        {showLaunchPlanning ? (
          <>
            <VitalSign
              title="% of church in groups"
              value={participationValue}
              empty={!planning || participation == null}
              meta={participationMeta}
              valueColor={P.sageTextStrong}
            />
            <VitalSign
              title="People in groups"
              value={planning ? String(lp.currentParticipants) : "—"}
              empty={!planning}
              meta={
                planning ? "Active participants" : "Planning data unavailable"
              }
            />
            <VitalSign
              title="Capacity used"
              value={capacityUsedPct == null ? "—" : `${capacityUsedPct}%`}
              empty={capacityUsedPct == null}
              meta={
                !planning
                  ? "Planning data unavailable"
                  : capacityUsedPct == null
                    ? "No capacity configured"
                    : `${lp.currentParticipants} of ${lp.effectiveTotalCapacity} seats`
              }
              valueColor={
                capacityUsedPct != null && capacityUsedPct >= 85
                  ? P.mustardTextStrong
                  : undefined
              }
            />
            <VitalSign
              title="Launch outlook"
              value={planning ? risk.label : "—"}
              empty={!planning}
              meta={
                planning
                  ? lp.recommendedNewGroups > 0
                    ? `Recommend ${lp.recommendedNewGroups} new ${lp.recommendedNewGroups === 1 ? "group" : "groups"}`
                    : "Capacity holds for now"
                  : "Planning data unavailable"
              }
              valueColor={risk.tone}
            />
            {/* Fillers square off the 10-cell band at the 3- and 6-column
                breakpoints so no empty grid slot shows the line color. */}
            <div aria-hidden="true" className="hidden bg-surface md:block" />
            <div aria-hidden="true" className="hidden bg-surface md:block" />
          </>
        ) : null}
      </div>
    </section>
  );
}
