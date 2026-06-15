import type { ReactNode } from "react";
import { PageBody } from "@/components/lg/PageHeader";
import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { VitalSignsBand } from "./VitalSignsBand";
import { LeaderCareOverviewCard } from "./LeaderCareOverviewCard";
import { LaunchPlanningOverviewCard } from "./LaunchPlanningOverviewCard";
import { HealthDistributionCard } from "./HealthDistributionCard";
import { GuestPipelineFunnelCard } from "./GuestPipelineFunnelCard";
import { InterestFunnelOverviewCard } from "./InterestFunnelOverviewCard";
import { MultiplyOverviewCard } from "./MultiplyOverviewCard";
import { LeaderPipelineOverviewCard } from "./LeaderPipelineOverviewCard";
import { NeedsAttentionArea } from "./NeedsAttentionArea";
import { SetupRecoveryChecklist } from "./SetupRecoveryChecklist";
import { ThisWeekCard } from "./ThisWeekCard";
import { ActivityBand } from "./ActivityBand";
import { ActivityResetControl } from "./ActivityResetControl";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";
import { PeriodSlicer } from "./PeriodSlicer";
import { CollapsibleOverview } from "./CollapsibleOverview";

// Home — the /admin triage page (#299). It answers "what needs my attention
// first?" by ranking urgent work above everything else, then stepping out to
// wider horizons in priority order:
//
//   1. Needs attention  — the ranked next-actions queue (care, group setup,
//      health, follow-ups), each row an imperative action with a direct link.
//   2. This week         — the near-term horizon: due follow-ups, launch
//      milestone. One action: View planning.
//   3. Ministry snapshot — point-in-time vital signs + the domain overview
//      cards (care, capacity, health, leader pipeline). Secondary metrics; kept
//      below the urgent work.
//   4. Recent activity   — METADATA ONLY (counts + period). Never note/summary
//      bodies — those stay on the guarded care surfaces (ADR 0002).
//
// Re-skinned warm (pastoral palette) so it meshes with the deep care / launch
// surfaces. See docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the admin-OS rationale.

// Sections speak in the serif voice — plain sentence-case headings, no
// tracked-uppercase eyebrows (the page kicker is the one tracked voice).
function SectionHeading({
  children,
  srOnly = false,
}: {
  children: ReactNode;
  // Visually hidden when the section's single card already carries the label
  // (e.g. This week → "The week ahead") so the label isn't said twice.
  srOnly?: boolean;
}) {
  return (
    <div
      className={
        srOnly ? "sr-only" : "font-display text-xl font-medium text-ink"
      }
    >
      {children}
    </div>
  );
}

export function DashboardClient({
  data,
  interestFunnel,
  multiplyReadiness,
  guestsLive,
  degraded,
  scopeId,
  mutedKeys,
  canResetActivity,
  hiddenNavAreas,
  isSuperAdmin,
}: {
  data: AdminDashboardData;
  // Pivot overview summaries (#470), loaded in parallel with the dashboard
  // read and degraded per-card: available:false renders an unavailable state,
  // never a false zero.
  interestFunnel: InterestFunnelDashboardSummary;
  multiplyReadiness: MultiplyReadinessDashboardSummary;
  guestsLive: boolean;
  // True when the dashboard read failed and `data` is demo fallback.
  degraded?: boolean;
  // Signed-in profile id, scoping the collapsible-overview saved default (#292).
  scopeId?: string | null;
  // "Needs attention" category keys a Super Admin has muted (launch optics).
  mutedKeys?: string[];
  // activity-reset: true for a super_admin, gating the Recent-activity reset
  // control. The server action is hard-gated too; this only hides the affordance.
  canResetActivity?: boolean;
  // Top-level area hrefs hidden from nav (ADR 0016). Home must not present stats
  // for a tab the operator retired, so the Ministry-snapshot overview cards that
  // drill into a now-hidden surface are dropped here too (the Care/Plan/Multiply
  // pivot keeps Home coherent on day one, #372). Omitted ⇒ hide nothing.
  hiddenNavAreas?: readonly string[];
  isSuperAdmin?: boolean;
}) {
  const hidden = new Set(hiddenNavAreas ?? []);
  // Launch-planning capacity drills into the Planning tab; the leader pipeline
  // drills into People. When their tab is hidden, their snapshot card would
  // report stats for a gone surface, so it drops out with the tab. Leader care
  // (Care), health distribution (Group-Health, now absorbed by Care), the
  // Interest Funnel (Plan) and Multiplication readiness (Multiply) stay; the
  // legacy guest funnel renders only when its frozen-surface flag is live
  // (`guestsLive`, #470) — the Interest Funnel card holds its slot by default.
  // The vital-signs band's four retired launch-planning metrics ride the same
  // Planning gate (#476): hidden by default, restored when Planning is shown.
  const showLaunchPlanning = !hidden.has("/admin/planning");
  const showLeaderPipeline = !hidden.has("/admin/people");
  return (
    <PageBody>
      <div className="grid gap-8">
        {/* 1 — Needs attention. The most urgent work leads Home: the ranked
            queue puts leader care, group setup, health checks, and overdue
            follow-ups in a fixed priority order, each a direct link. */}
        <section
          aria-labelledby="home-needs-attention"
          className="grid gap-2.5"
        >
          <SectionHeading>
            <span id="home-needs-attention">Needs attention</span>
          </SectionHeading>
          <NeedsAttentionArea
            data={data}
            degraded={degraded}
            mutedKeys={mutedKeys}
            hiddenNavAreas={hiddenNavAreas}
          />
          <SetupRecoveryChecklist
            data={data}
            degraded={degraded}
            isSuperAdmin={isSuperAdmin}
            hiddenNavAreas={hiddenNavAreas}
          />
        </section>

        {/* 2 — This week. The near-term horizon, composed from data already on
            the dashboard (due follow-ups, launch milestone). The card's own
            serif title carries the visible label — one label, not three. */}
        <section aria-labelledby="home-this-week" className="grid gap-2.5">
          <SectionHeading srOnly>
            <span id="home-this-week">This week</span>
          </SectionHeading>
          <ThisWeekCard data={data} degraded={degraded} />
        </section>

        {/* 3 — Ministry snapshot. Point-in-time vital signs + domain overview
            cards. Secondary to the urgent work above, so it sits lower and the
            deeper cards collapse behind a disclosure. The band is founded on
            the Care/Plan/Multiply pivot signals (#476) and reuses the same
            funnel/readiness summaries the overview cards render; its retired
            launch-planning metrics ride the same Planning nav gate as the
            LaunchPlanningOverviewCard below. */}
        <section aria-labelledby="home-snapshot" className="grid gap-3">
          <SectionHeading>
            <span id="home-snapshot">Ministry snapshot</span>
          </SectionHeading>
          <VitalSignsBand
            data={data}
            interestFunnel={interestFunnel}
            multiplyReadiness={multiplyReadiness}
            showLaunchPlanning={showLaunchPlanning}
            degraded={degraded}
          />

          <CollapsibleOverview scopeId={scopeId}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LeaderCareOverviewCard summary={data.shepherdCare} />
              {showLaunchPlanning ? (
                <LaunchPlanningOverviewCard
                  snapshot={data.launchPlanning}
                  multiplication={data.multiplication}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <HealthDistributionCard counts={data.healthSummary.counts} />
              {/* The pivot areas' overview cards (#470): the Interest Funnel
                  takes the slot the frozen Guests placeholder held, and
                  Multiplication readiness joins it — so Plan and Multiply are
                  visible from the command center under default flags. The
                  legacy guests card returns only when its frozen-surface flag
                  is live (re-enabled-and-verified, #256). */}
              <InterestFunnelOverviewCard summary={interestFunnel} />
              <MultiplyOverviewCard
                summary={multiplyReadiness}
                multiplication={data.multiplication}
              />
              {guestsLive ? (
                <GuestPipelineFunnelCard
                  breakdown={data.guestPipelineBreakdown}
                  total={data.guestPipelineCount}
                  live={guestsLive}
                />
              ) : null}
              {showLeaderPipeline ? (
                <LeaderPipelineOverviewCard summary={data.leaderPipeline} />
              ) : null}
            </div>
          </CollapsibleOverview>
        </section>

        {/* 4 — Recent activity. Metadata only (counts + period), never note or
            summary bodies — those stay on the guarded care surfaces (ADR 0002).
            There is no /admin/activity route; the period slicer scopes these
            counts in place. */}
        <section
          aria-labelledby="home-recent-activity"
          className="grid gap-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>
              <span id="home-recent-activity">Recent activity</span>
            </SectionHeading>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {canResetActivity ? (
                <div className="flex items-center gap-2">
                  <SuperAdminOnlyMark />
                  <ActivityResetControl
                    baselineOn={data.activity.resetBaselineOn}
                  />
                </div>
              ) : null}
              <PeriodSlicer current={data.activity.grain} />
            </div>
          </div>
          <ActivityBand activity={data.activity} guestsLive={guestsLive} />
        </section>
      </div>
    </PageBody>
  );
}
