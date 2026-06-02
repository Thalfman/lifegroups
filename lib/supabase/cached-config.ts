import { unstable_cache } from "next/cache";
import type { AppSettingsRow } from "@/types/database";
import { fetchMetricDefaults } from "./read-models";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Cache tag for the global metric_defaults config. The admin settings write
// actions (update / reset) bust this tag so a save is reflected on the next
// read; see app/(protected)/admin/settings/actions.ts.
export const METRIC_DEFAULTS_CACHE_TAG = "config:metric-defaults";

// Backstop revalidation window (seconds). metric_defaults changes rarely and
// every in-app edit busts the tag, so this only matters for out-of-band edits
// (e.g. a manual DB change) -- a few minutes of staleness there is fine.
const METRIC_DEFAULTS_REVALIDATE_SECONDS = 300;

// metric_defaults (the single `app_settings` row keyed 'metric_defaults') is
// global, identity-INDEPENDENT config: every authenticated user reads the same
// row, and it is read on many pages -- including the hot leader check-in and
// over-shepherd paths. Pull it through the Next.js data cache so repeat reads
// across requests skip the PostgREST round-trip, and bust the tag on write.
//
// The request client is captured in the closure rather than passed as an
// argument, so it never becomes part of the cache key; on a cache hit the inner
// function -- and the client -- are never touched. Because the row is identical
// for every authenticated caller, whichever request fills the cache yields the
// same value for all. unstable_cache is a DATA cache and still applies inside
// `dynamic = "force-dynamic"` routes (it is independent of full-route caching),
// and nothing inside the cached function calls cookies()/headers(), so it does
// not trigger a dynamic bailout. A failed read is re-thrown so a transient
// error is never cached; we map it back to the ReadResult shape callers handle.
//
// Per-user / RLS-divergent reads are deliberately NOT cached this way. The two
// admin-only config reads (platform_config, group_metric_settings) stay on the
// per-request RLS path: caching them cross-user would require elevating
// privilege at cache-fill, against this codebase's no-service-role-in-runtime
// posture, for little gain (they are read on only a couple of admin pages).
export async function fetchMetricDefaultsCached(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  try {
    const data = await unstable_cache(
      async () => {
        const res = await fetchMetricDefaults(client);
        if (res.error) throw res.error;
        return res.data;
      },
      [METRIC_DEFAULTS_CACHE_TAG],
      {
        tags: [METRIC_DEFAULTS_CACHE_TAG],
        revalidate: METRIC_DEFAULTS_REVALIDATE_SECONDS,
      }
    )();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: wrapError("fetchMetricDefaultsCached", err) };
  }
}
