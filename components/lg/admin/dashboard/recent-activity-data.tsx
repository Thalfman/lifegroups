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
import { RecentActivitySection } from "./RecentActivitySection";

// Async data child for Home's "Recent activity" boundary (#802 follow-up). Kept
// in a SEPARATE file from the presentational RecentActivitySection so the server
// imports below (createSupabaseServerClient + reads) never reach the "use client"
// a11y harness that imports the presentational section — mirroring the
// MultiplyOverviewSection / MinistrySnapshotSection split.
//
// It does the activity reads on its own, off the LCP path: groups rides the
// per-request cached groups loader (lib/admin/groups-read.ts), so it shares
// Boundary A's single groups read at no extra round trip; only the guests read +
// the four activity-count tiles are new work, and they happen after the main
// paint. The no-client preview renders the typed demo summary. Each read
// degrades to a safe input — a failed activity-counts read yields
// extendedAvailable:false (tiles show "—"), never a false zero.
export async function RecentActivityData({
  grain,
  guestsLive,
  canResetActivity,
  degraded = false,
  now = new Date(),
}: {
  grain: OverviewGrain;
  guestsLive: boolean;
  canResetActivity?: boolean;
  // True when the dashboard read degraded to demo fallback (a gated read
  // failed). Activity used to ride that same fallback object; now that it reads
  // independently, honour the degrade here too — otherwise a degraded Home would
  // show live (or false-zero) activity beside demo data. Skip the live reads and
  // render the same demo summary the rest of the degraded page shows.
  degraded?: boolean;
  now?: Date;
}) {
  const client = await createSupabaseServerClient();
  if (!client || degraded) {
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
