import Link from "next/link";
import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import {
  resolveCareCoverageState,
  type CareDashboardSummary,
} from "@/lib/admin/shepherd-care-dashboard";
import { buildShepherdCareTriageLink } from "@/lib/admin/shepherd-care-view";
import {
  FROM_SETUP_PARAM,
  FROM_SETUP_VALUE,
} from "@/lib/dashboard/setup-recovery";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const LINK_RESET = "block text-inherit no-underline";

// #649: a setup deep-link carrying the ?from=setup marker, so the neutral
// "not active yet" state lands in the guided setup chain (Home re-focuses the
// next incomplete step — import / assign leaders) and offers a return path.
const SETUP_CHAIN_HREF = `/admin?${FROM_SETUP_PARAM}=${FROM_SETUP_VALUE}`;

export function ShepherdCareDashboardSummaryCards({
  summary,
  coverageAvailable,
  followUpsAvailable,
}: {
  summary: CareDashboardSummary;
  coverageAvailable: boolean;
  followUpsAvailable: boolean;
}) {
  // With no active leaders the per-tile counts are all zero, so the success
  // metas ("Everyone is up to date", "Every active leader is covered") read as
  // vacuous truths on a fresh system. Show a single neutral "not active yet"
  // state that points into setup instead (#649).
  if (
    resolveCareCoverageState(summary, { coverageAvailable }) === "not_active"
  ) {
    return (
      <section aria-labelledby="shepherd-care-summary">
        <h2 id="shepherd-care-summary" className="sr-only">
          Shepherd care summary
        </h2>
        <div className="rounded-md border border-line bg-surface px-4 py-3.5">
          <div className="font-display text-lg font-medium text-ink">
            Care coverage is not active yet
          </div>
          <p className="m-0 mt-1 font-sans text-sm text-ink2">
            There are no active leaders to care for yet, so there is nothing to
            track. Add and assign leaders to turn on care coverage — then this
            summary shows who needs a touch.
          </p>
          <Link
            href={SETUP_CHAIN_HREF}
            className="mt-3 inline-flex font-sans text-sm font-semibold text-clay no-underline hover:underline"
          >
            Go to setup -&gt;
          </Link>
        </div>
      </section>
    );
  }

  const totalMeta =
    summary.totalActiveShepherds === 0
      ? "Import or mark shepherds to turn on care coverage"
      : `${summary.totalActiveShepherds} ${plural(summary.totalActiveShepherds, "shepherd / co-shepherd", "shepherds + co-shepherds")}`;

  const needsAttentionMeta =
    summary.needsAttention === 0
      ? "Everyone is up to date"
      : `${plural(summary.needsAttention, "Shepherd needs", "Shepherds need")} a touch this week`;

  const overdueMeta =
    summary.overdueTouchpoints === 0
      ? "No touchpoints overdue"
      : `${plural(summary.overdueTouchpoints, "Touchpoint past", "Touchpoints past")} due`;

  const staleMeta =
    summary.notContactedRecently === 0
      ? "All recent contact is fresh"
      : `${plural(summary.notContactedRecently, "Shepherd not", "Shepherds not")} contacted in 60+ days`;

  const noProfileMeta =
    summary.noCareProfile === 0
      ? "Every shepherd has a profile"
      : `${plural(summary.noCareProfile, "Shepherd has", "Shepherds have")} no care profile yet`;

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
      ? "Every active shepherd is covered"
      : `${plural(summary.unassignedCoverage, "Shepherd has", "Shepherds have")} no over-shepherd`;
  // The dashboard renders "—" instead of a misleading "0" when the coverage
  // assignments read failed, so admins can tell apart "no unassigned" from
  // "we don't know".
  const unassignedValue = coverageAvailable
    ? String(summary.unassignedCoverage)
    : "—";

  // Tiles that map to a triage target render as Links (#180, re-aimed by
  // #477): the needs-attention tile reopens the All-leaders tab with the
  // roster's needs-attention filter pre-applied, and the unassigned-coverage
  // tile lands on the Over-Shepherds accordion, where the Unassigned pane
  // lives. Tiles without a clean target (totals, no-profile) stay as plain
  // metric cards.
  const needsAttentionHref = buildShepherdCareTriageLink({
    kind: "needs_attention",
  });
  const unassignedHref = buildShepherdCareTriageLink({ kind: "unassigned" });

  return (
    <section aria-labelledby="shepherd-care-summary">
      <h2 id="shepherd-care-summary" className="sr-only">
        Shepherd care summary
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:gap-3.5">
        <MetricCard
          title="Active shepherds"
          value={String(summary.totalActiveShepherds)}
          meta={totalMeta}
          accent={P.sage}
          valueColor={P.ink}
        />
        <Link
          href={needsAttentionHref}
          aria-label="Filter the shepherd roster to needs attention"
          className={LINK_RESET}
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
            aria-label="Show unassigned coverage in the Over-Shepherds tab"
            className={LINK_RESET}
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
