import type { ReactNode } from "react";
import { PageBody } from "@/components/lg/PageHeader";
import { P, fontSans } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { VitalSignsBand } from "./VitalSignsBand";
import { LeaderCareOverviewCard } from "./LeaderCareOverviewCard";
import { LaunchPlanningOverviewCard } from "./LaunchPlanningOverviewCard";
import { HealthDistributionCard } from "./HealthDistributionCard";
import { GuestPipelineFunnelCard } from "./GuestPipelineFunnelCard";
import { LeaderPipelineOverviewCard } from "./LeaderPipelineOverviewCard";
import { NeedsAttentionArea } from "./NeedsAttentionArea";
import { ThisWeekCard } from "./ThisWeekCard";
import { ActivityBand } from "./ActivityBand";
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

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontSans,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1.8,
        color: P.ink3,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function DashboardClient({
  data,
  guestsLive,
  degraded,
  scopeId,
}: {
  data: AdminDashboardData;
  guestsLive: boolean;
  // True when the dashboard read failed and `data` is demo fallback.
  degraded?: boolean;
  // Signed-in profile id, scoping the collapsible-overview saved default (#292).
  scopeId?: string | null;
}) {
  return (
    <PageBody>
      <div style={{ display: "grid", gap: 22 }}>
        {/* 1 — Needs attention. The most urgent work leads Home: the ranked
            queue puts leader care, group setup, health checks, and overdue
            follow-ups in a fixed priority order, each a direct link. */}
        <section
          aria-labelledby="home-needs-attention"
          style={{ display: "grid", gap: 10 }}
        >
          <SectionHeading>
            <span id="home-needs-attention">Needs attention</span>
          </SectionHeading>
          <NeedsAttentionArea data={data} degraded={degraded} />
        </section>

        {/* 2 — This week. The near-term horizon, composed from data already on
            the dashboard (due follow-ups, launch milestone). */}
        <section
          aria-labelledby="home-this-week"
          style={{ display: "grid", gap: 10 }}
        >
          <SectionHeading>
            <span id="home-this-week">This week</span>
          </SectionHeading>
          <ThisWeekCard data={data} />
        </section>

        {/* 3 — Ministry snapshot. Point-in-time vital signs + domain overview
            cards. Secondary to the urgent work above, so it sits lower and the
            deeper cards collapse behind a disclosure. */}
        <section
          aria-labelledby="home-snapshot"
          style={{ display: "grid", gap: 12 }}
        >
          <SectionHeading>
            <span id="home-snapshot">Ministry snapshot</span>
          </SectionHeading>
          <VitalSignsBand data={data} />

          <CollapsibleOverview scopeId={scopeId}>
            <div
              className="lg-shell-grid-2"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 18,
              }}
            >
              <LeaderCareOverviewCard summary={data.shepherdCare} />
              <LaunchPlanningOverviewCard
                snapshot={data.launchPlanning}
                multiplication={data.multiplication}
              />
            </div>

            <div
              className="lg-shell-grid-3"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 18,
              }}
            >
              <HealthDistributionCard counts={data.healthSummary.counts} />
              <GuestPipelineFunnelCard
                breakdown={data.guestPipelineBreakdown}
                total={data.guestPipelineCount}
                live={guestsLive}
              />
              <LeaderPipelineOverviewCard summary={data.leaderPipeline} />
            </div>
          </CollapsibleOverview>
        </section>

        {/* 4 — Recent activity. Metadata only (counts + period), never note or
            summary bodies — those stay on the guarded care surfaces (ADR 0002).
            There is no /admin/activity route; the period slicer scopes these
            counts in place. */}
        <section
          aria-labelledby="home-recent-activity"
          style={{ display: "grid", gap: 10 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <SectionHeading>
              <span id="home-recent-activity">Recent activity</span>
            </SectionHeading>
            <PeriodSlicer current={data.activity.grain} />
          </div>
          <ActivityBand activity={data.activity} />
        </section>
      </div>
    </PageBody>
  );
}
