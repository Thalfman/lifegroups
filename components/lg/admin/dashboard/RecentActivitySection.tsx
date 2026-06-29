import type { CSSProperties } from "react";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGuests,
  fetchOverviewActivityCounts,
} from "@/lib/supabase/read-models";
import { fetchActivityResetBaseline } from "@/lib/supabase/maintenance-reads";
import { loadAllGroupsForAdmin } from "@/lib/admin/groups-read";
import {
  buildActivitySummary,
  resolveActivityWindow,
} from "@/lib/dashboard/activity-summary";
import { fallbackActivity } from "@/lib/dashboard/fallback-data";
import type { OverviewActivitySummary } from "@/lib/dashboard/types";
import type { OverviewGrain } from "@/lib/admin/overview-period";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";
import { ActivityBand } from "./ActivityBand";
import { ActivityResetControl } from "./ActivityResetControl";
import { PeriodSlicer } from "./PeriodSlicer";

// Section 4 of Home — "Recent activity" (metadata only: counts + period, never
// note/summary bodies; ADR 0002). Lifted out of DashboardClient's `data` object
// into its own streamed Suspense boundary (#802 follow-up): its period-scoped
// activity-counts read depends on the activity-reset baseline, so it is a second
// serial round trip. Keeping it in Boundary A's dashboard read held the
// above-the-fold "Needs attention / This week" paint behind it; here it streams
// in AFTER the main paint instead. The two cheap supporting reads (groups,
// guests) and the four head-count tiles stay off the LCP path.

// Presentational section. Rendered by the async loader below in the live app and
// directly (with demo data) by the structure test / a11y harness, mirroring the
// MinistrySnapshotSection split.
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

// Async data child: does the activity reads on its own (off the LCP path) and
// renders the section. groups rides the per-request cached groups loader
// (lib/admin/groups-read.ts), so it shares Boundary A's single groups read at no
// extra round trip; only the guests read + the four activity-count tiles are
// new work, and they happen after the main paint. The no-client preview renders
// the typed demo summary. Each read degrades to a safe input — a failed
// activity-counts read yields extendedAvailable:false (tiles show "—"), never a
// false zero.
export async function RecentActivityData({
  grain,
  guestsLive,
  canResetActivity,
  now = new Date(),
}: {
  grain: OverviewGrain;
  guestsLive: boolean;
  canResetActivity?: boolean;
  now?: Date;
}) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return (
      <RecentActivitySection
        activity={fallbackActivity}
        guestsLive={guestsLive}
        canResetActivity={canResetActivity}
      />
    );
  }

  const activity = await measureReadBundle(
    "admin_home_recent_activity",
    async (): Promise<OverviewActivitySummary> => {
      // The reset baseline floors the period's lower bound; resolve it first so
      // the counts read measures from the SAME "as-of" the TS-side tiles use.
      const baselineRes = await fetchActivityResetBaseline(client);
      const baselineOn = baselineRes.error ? null : (baselineRes.data ?? null);
      const { period, floorIso } = resolveActivityWindow(
        grain,
        now,
        baselineOn
      );

      const [groupsRes, guestsRes, activityRes] = await Promise.all([
        loadAllGroupsForAdmin(),
        fetchGuests(client),
        fetchOverviewActivityCounts(client, {
          fromIso: floorIso,
          toExclusiveIso: period.toExclusiveIso,
        }),
      ]);

      return buildActivitySummary(
        period,
        floorIso,
        baselineOn,
        groupsRes.data ?? [],
        guestsRes.data ?? [],
        activityRes
      );
    },
    (a) => ({ result_kind: a.extendedAvailable ? "ok" : "degraded" })
  );

  return (
    <RecentActivitySection
      activity={activity}
      guestsLive={guestsLive}
      canResetActivity={canResetActivity}
    />
  );
}

// Streaming fallback: the section heading paints immediately (no layout shift on
// the heading row) and a pulse bar reserves the band's height.
function Bar({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-md bg-lineSoft"
      style={style}
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
      <Bar style={{ height: 96, borderRadius: 12 }} />
    </section>
  );
}
