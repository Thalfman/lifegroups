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
import type { ReadResult } from "@/lib/supabase/read-core";
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
  now,
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
  // The SINGLE request clock, pinned by AdminHomeData and shared with
  // getAdminDashboardData. Required (not defaulted) so this streamed boundary
  // never samples a second `new Date()` — a cold render crossing a church-local
  // day/month boundary must compute the activity window against the same date as
  // the dashboard data above it.
  now: Date;
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

      // The "Guests welcomed" tile only renders while the Guests surface is
      // live, so skip the guests read entirely when it's frozen (the default
      // path): reading it would be avoidable Supabase work and would pull guest
      // PII into this boundary for a value that is never shown. The empty result
      // leaves the hidden tile a harmless 0.
      const guestsRead: Promise<
        ReadResult<readonly { first_attended_date: string | null }[]>
      > = guestsLive
        ? fetchGuests(client)
        : Promise.resolve({ data: [], error: null });

      const [groupsRes, guestsRes, activityRes] = await Promise.all([
        loadAllGroupsForAdmin(),
        guestsRead,
        fetchOverviewActivityCounts(client, {
          fromIso: floorIso,
          toExclusiveIso: period.toExclusiveIso,
        }),
      ]);

      // buildActivitySummary degrades each tile independently: a failed groups /
      // guests / counts read renders that tile as "—", never a false zero and
      // never demo counts (the whole-page demo states are the no-client /
      // degraded-dashboard short-circuits above). So a transient per-tile read
      // failure on an otherwise-live Home shows just that tile unavailable.
      return buildActivitySummary(
        period,
        floorIso,
        baselineOn,
        groupsRes,
        guestsRes,
        activityRes
      );
    },
    // Report a partial failure as degraded for telemetry: a null groups/guests
    // tile (its read failed) must not be logged as "ok" just because the counts
    // read succeeded. extendedAvailable covers the counts read; the null checks
    // cover the array-derived tiles. (A hidden guests tile is an empty 0, not
    // null, so a frozen-guests Home still logs "ok".)
    (a) => ({
      result_kind:
        a.extendedAvailable &&
        a.groupsLaunched !== null &&
        a.guestsWelcomed !== null
          ? "ok"
          : "degraded",
    })
  );

  return (
    <RecentActivitySection
      activity={activity}
      guestsLive={guestsLive}
      canResetActivity={canResetActivity}
    />
  );
}
