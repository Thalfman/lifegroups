import Link from "next/link";
import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import type { CareDashboardSummary } from "@/lib/admin/shepherd-care-dashboard";
import { buildShepherdCareTriageLink } from "@/lib/admin/shepherd-care-view";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const linkResetStyle = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
};

export function ShepherdCareDashboardSummaryCards({
  summary,
  coverageAvailable,
  followUpsAvailable,
}: {
  summary: CareDashboardSummary;
  coverageAvailable: boolean;
  followUpsAvailable: boolean;
}) {
  const totalMeta =
    summary.totalActiveShepherds === 0
      ? "No active leaders or co-leaders"
      : `${summary.totalActiveShepherds} ${plural(summary.totalActiveShepherds, "leader / co-leader", "leaders + co-leaders")}`;

  const needsAttentionMeta =
    summary.needsAttention === 0
      ? "Everyone is up to date"
      : `${plural(summary.needsAttention, "Leader needs", "Leaders need")} a touch this week`;

  const overdueMeta =
    summary.overdueTouchpoints === 0
      ? "No touchpoints overdue"
      : `${plural(summary.overdueTouchpoints, "Touchpoint past", "Touchpoints past")} due`;

  const staleMeta =
    summary.notContactedRecently === 0
      ? "All recent contact is fresh"
      : `${plural(summary.notContactedRecently, "Leader not", "Leaders not")} contacted in 60+ days`;

  const noProfileMeta =
    summary.noCareProfile === 0
      ? "Every leader has a profile"
      : `${plural(summary.noCareProfile, "Leader has", "Leaders have")} no care profile yet`;

  const followUpMeta = !followUpsAvailable
    ? "Follow-up data temporarily unavailable"
    : summary.outstandingFollowUps === 0
      ? "No outstanding follow-ups"
      : `${summary.outstandingFollowUps} outstanding ${plural(summary.outstandingFollowUps, "follow-up", "follow-ups")}`;
  // Render "—" instead of a misleading "0" when the follow-up read failed, so
  // admins can tell "none overdue" apart from "we don't know" — mirroring the
  // unassigned-coverage tile.
  const overdueFollowUpValue = followUpsAvailable
    ? String(summary.overdueFollowUps)
    : "—";

  const unassignedMeta = !coverageAvailable
    ? "Coverage data temporarily unavailable"
    : summary.unassignedCoverage === 0
      ? "Every active leader is covered"
      : `${plural(summary.unassignedCoverage, "Leader has", "Leaders have")} no over-shepherd`;
  // The dashboard renders "—" instead of a misleading "0" when the coverage
  // assignments read failed, so admins can tell apart "no unassigned" from
  // "we don't know".
  const unassignedValue = coverageAvailable
    ? String(summary.unassignedCoverage)
    : "—";

  // Tiles that map to a triage target render as Links into the Directory view
  // with the matching filter pre-applied (#180) — the Dashboard scans, the
  // Directory is where you act. Tiles without a clean filter mapping (totals,
  // no-profile) stay as plain metric cards.
  const needsAttentionHref = buildShepherdCareTriageLink({
    kind: "needs_attention",
  });
  const unassignedHref = buildShepherdCareTriageLink({ kind: "unassigned" });

  return (
    <section aria-labelledby="shepherd-care-summary">
      <h2 id="shepherd-care-summary" className="sr-only">
        Leader care summary
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
          title="Active leaders"
          value={String(summary.totalActiveShepherds)}
          meta={totalMeta}
          accent={P.sage}
          valueColor={P.ink}
        />
        <Link
          href={needsAttentionHref}
          aria-label="Filter directory by needs attention"
          style={linkResetStyle}
        >
          <MetricCard
            title="Needs attention"
            value={String(summary.needsAttention)}
            meta={needsAttentionMeta}
            accent={P.terra}
            valueColor={summary.needsAttention > 0 ? P.terra : P.ink}
          />
        </Link>
        <MetricCard
          title="Overdue touchpoints"
          value={String(summary.overdueTouchpoints)}
          meta={overdueMeta}
          accent={P.terra}
          valueColor={summary.overdueTouchpoints > 0 ? P.terra : P.ink}
        />
        <MetricCard
          title="Not contacted recently"
          value={String(summary.notContactedRecently)}
          meta={staleMeta}
          accent={P.mustard}
          valueColor={summary.notContactedRecently > 0 ? P.mustard : P.ink}
        />
        <MetricCard
          title="No care profile"
          value={String(summary.noCareProfile)}
          meta={noProfileMeta}
          accent={P.ink3}
          valueColor={P.ink}
        />
        <MetricCard
          title="Overdue follow-ups"
          value={overdueFollowUpValue}
          meta={followUpMeta}
          accent={followUpsAvailable ? P.terra : P.ink3}
          valueColor={
            followUpsAvailable && summary.overdueFollowUps > 0 ? P.terra : P.ink
          }
        />
        {coverageAvailable ? (
          <Link
            href={unassignedHref}
            aria-label="Filter directory by unassigned coverage"
            style={linkResetStyle}
          >
            <MetricCard
              title="Unassigned coverage"
              value={unassignedValue}
              meta={unassignedMeta}
              accent={P.mustard}
              valueColor={summary.unassignedCoverage > 0 ? P.mustard : P.ink}
            />
          </Link>
        ) : (
          <MetricCard
            title="Unassigned coverage"
            value={unassignedValue}
            meta={unassignedMeta}
            accent={P.ink3}
            valueColor={P.ink3}
          />
        )}
      </div>
    </section>
  );
}
