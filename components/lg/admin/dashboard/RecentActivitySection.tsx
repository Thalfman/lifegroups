import type { OverviewActivitySummary } from "@/lib/dashboard/types";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";
import { ActivityBand } from "./ActivityBand";
import { ActivityResetControl } from "./ActivityResetControl";
import { PeriodSlicer } from "./PeriodSlicer";

// Section 4 of Home — "Recent activity" (metadata only: counts + period, never
// note/summary bodies; ADR 0002). Lifted out of DashboardClient's `data` object
// into its own streamed Suspense boundary (#802 follow-up): its period-scoped
// activity-counts read depends on the activity-reset baseline, so it is a second
// serial round trip. Keeping it in Boundary A's dashboard read held the
// above-the-fold "Needs attention / This week" paint behind it; the page now
// streams it in AFTER the main paint via RecentActivityData.
//
// This file is presentational ONLY (no server imports) so the "use client" a11y
// harness and the structure test can import it directly — the async data loader
// that does the Supabase reads lives in recent-activity-data.tsx, mirroring the
// MultiplyOverviewSection / MinistrySnapshotSection split.
export function RecentActivitySection({
  activity,
  guestsLive,
  canResetActivity,
}: {
  activity: OverviewActivitySummary;
  guestsLive: boolean;
  // activity-reset: true for a super_admin, gating the reset control. The server
  // action is hard-gated too; this only hides the affordance.
  canResetActivity?: boolean;
}) {
  return (
    <section aria-labelledby="home-recent-activity" className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-xl font-medium text-ink">
          <span id="home-recent-activity">Recent activity</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canResetActivity ? (
            <div className="flex items-center gap-2">
              <SuperAdminOnlyMark />
              <ActivityResetControl baselineOn={activity.resetBaselineOn} />
            </div>
          ) : null}
          <PeriodSlicer current={activity.grain} />
        </div>
      </div>
      <ActivityBand activity={activity} guestsLive={guestsLive} />
    </section>
  );
}

// Streaming fallback: the section heading paints immediately (no layout shift on
// the heading row) and a pulse bar reserves the band's height. Presentational,
// so the page can use it as the boundary's Suspense fallback.
function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={"animate-pulse bg-lineSoft " + className}
    />
  );
}

export function RecentActivitySkeleton() {
  return (
    <section
      aria-labelledby="home-recent-activity"
      className="grid gap-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-xl font-medium text-ink">
          <span id="home-recent-activity">Recent activity</span>
        </div>
      </div>
      <span className="sr-only">Loading recent activity…</span>
      <Bar className="h-24 rounded-md" />
    </section>
  );
}
