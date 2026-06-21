import type { AdminDashboardData } from "@/lib/dashboard/types";
import type {
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
import { CollapsibleOverview } from "./CollapsibleOverview";

// The Ministry-snapshot body — the point-in-time vital-signs band plus the
// collapsible domain overview cards. Extracted from DashboardClient (#777 WS2)
// so the real /admin page can stream it behind its own <Suspense> boundary
// (MultiplyOverviewSection feeds it after the slow Prospect-count + Multiply-grid
// reads resolve), while keeping it a PURE, synchronous component the structure
// tests and the a11y harness can still render with injected summaries.
//
// The section heading ("Ministry snapshot") stays in DashboardClient, outside the
// streaming boundary, so it paints with the LCP-path content; this renders the
// band + cards that depend on the two #470 summaries.
export function MinistrySnapshotSection({
  data,
  interestFunnel,
  multiplyReadiness,
  showLaunchPlanning,
  showLeaderPipeline,
  guestsLive,
  scopeId,
  degraded = false,
}: {
  data: AdminDashboardData;
  // Pivot overview summaries (#470/#476), loaded alongside the dashboard read
  // and degraded per-card: available:false renders an unavailable state, never a
  // false zero.
  interestFunnel: InterestFunnelDashboardSummary;
  multiplyReadiness: MultiplyReadinessDashboardSummary;
  // True only when /admin/planning is NOT nav-hidden (ADR 0016): the retired
  // launch-planning band cells + card ride this gate.
  showLaunchPlanning: boolean;
  // True only when /admin/people is NOT nav-hidden: the leader-pipeline card
  // rides this gate.
  showLeaderPipeline: boolean;
  guestsLive: boolean;
  // Signed-in profile id, scoping the collapsible-overview saved default (#292).
  scopeId?: string | null;
  // True when the dashboard read failed and `data` is demo fallback.
  degraded?: boolean;
}) {
  return (
    <>
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
    </>
  );
}
