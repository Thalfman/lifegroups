import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchOverShepherdByIdForAdmin,
  fetchShepherdsCoveredByOverShepherdForAdmin,
  type ShepherdCoveredByOverShepherd,
} from "@/lib/supabase/shepherd-care-reads";
import type { OverShepherdsRow } from "@/types/database";

// The Over-Shepherd detail page's read-orchestration, as a pure function of a
// reads seam (ADR 0015), following the shape proven by the shepherd-care
// detail migration (#488). Production binds the live client through
// `supabaseOverShepherdDetailReads`; a test binds an in-memory adapter
// satisfying the same interface. Two adapters, one seam.

export type OverShepherdDetailData =
  | {
      kind: "ok";
      overShepherd: OverShepherdsRow;
      coveredShepherds: ShepherdCoveredByOverShepherd[];
      // A failed coverage read suppresses only the "Currently covers" list —
      // the page banner carries the failure instead of a false "no coverage".
      error: string | null;
    }
  | { kind: "not_found" }
  // The over-shepherd record itself failed to load: block the edit form
  // entirely (see buildOverShepherdDetailData) rather than seeding it empty.
  | { kind: "load_error"; message: string };

// The page-facing result: the pure build's union, plus the no-database case
// the load wrapper reports when Supabase env vars are absent.
export type OverShepherdDetailResult =
  | OverShepherdDetailData
  | { kind: "db_unavailable" };

const OVER_SHEPHERD_DETAIL_FETCHERS = {
  fetchOverShepherd: fetchOverShepherdByIdForAdmin,
  fetchCoveredShepherds: fetchShepherdsCoveredByOverShepherdForAdmin,
};

export type OverShepherdDetailReads = BoundReads<
  typeof OVER_SHEPHERD_DETAIL_FETCHERS
>;

// Production adapter: binds the live Supabase client to the two reads this
// surface needs. The underlying fetchers keep their explicit column
// allowlists.
export function supabaseOverShepherdDetailReads(
  client: AppSupabaseClient
): OverShepherdDetailReads {
  return bindReads(
    client,
    OVER_SHEPHERD_DETAIL_FETCHERS,
    "over_shepherd_detail"
  );
}

// Pure assembly: subject resolution decides 404 vs render; the coverage list
// degrades to empty with the failure surfaced through `error` — never a
// silent false zero on a section that did load.
export async function buildOverShepherdDetailData(
  reads: OverShepherdDetailReads,
  overShepherdId: string
): Promise<OverShepherdDetailData> {
  const [overShepherdRes, coveredRes] = await Promise.all([
    reads.fetchOverShepherd(overShepherdId),
    reads.fetchCoveredShepherds(overShepherdId),
  ]);
  // Block the edit form entirely when the over-shepherd record fails to
  // load. Returning a dummy "Unknown" record would let an admin submit
  // the edit form and overwrite the real record with placeholder
  // values; surface the error instead.
  if (overShepherdRes.error) {
    return { kind: "load_error", message: overShepherdRes.error.message };
  }
  if (!overShepherdRes.data) return { kind: "not_found" };

  return {
    kind: "ok",
    overShepherd: overShepherdRes.data,
    coveredShepherds: coveredRes.data ?? [],
    error: coveredRes.error?.message ?? null,
  };
}

// Binds the live client (or reports db_unavailable when the DB is not
// configured) and runs the pure assembly. The calling page stays guard →
// load → render.
export async function loadOverShepherdDetailData(
  overShepherdId: string
): Promise<OverShepherdDetailResult> {
  return measureReadBundle(
    "over_shepherd_detail",
    async () => {
      const client = await createSupabaseServerClient();
      if (!client) return { kind: "db_unavailable" };
      return buildOverShepherdDetailData(
        supabaseOverShepherdDetailReads(client),
        overShepherdId
      );
    },
    (result) => ({ result_kind: result.kind })
  );
}
