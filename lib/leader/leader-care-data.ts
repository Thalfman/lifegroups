import "server-only";

// The Leader landing page's read-orchestration, as a pure function of a reads
// seam (ADR 0015 — this surface and the Over-Shepherd landing were the two
// login tiers the admin-focused migration never reached; 2026-07-06 review
// candidate 3). Production binds the live client through `bindLeaderReads`;
// a test binds an in-memory adapter satisfying the same interface.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindLeaderReads, type LeaderReads } from "@/lib/leader/leader-reads";
import type { LeaderSafeGroupRow } from "@/lib/supabase/group-reads";

// The subset of the surface's seam this page needs (ADR 0015: per-surface
// interfaces, not one god-interface — and per-page subsets of those).
export type LeaderCareReads = Pick<
  LeaderReads,
  "fetchLeaderGroupsByIds" | "readFirstRunOrientationSeen"
>;

// The page switches on `kind` and keeps the effect to itself: a failed groups
// read `throw`s from the Server Component (the page's established behavior —
// its error boundary owns the failure, unlike the Over-Shepherd landing's
// degrade-to-empty-state), so the error rides in the union rather than being
// thrown from this pure function.
export type LeaderCareData =
  | { kind: "ok"; orientationSeen: boolean; groups: LeaderSafeGroupRow[] }
  | { kind: "load_error"; error: Error };

export async function buildLeaderCareData(
  reads: LeaderCareReads,
  groupIds: string[]
): Promise<LeaderCareData> {
  // The first-run "seen" flag (#560) and the groups read are independent, so
  // fetch them in parallel rather than paying two serial round-trips on first
  // paint. A failed orientation read degrades to "seen" (inside the helper)
  // so the card never nags on a flaky load.
  const [orientationSeen, groupsResult] = await Promise.all([
    reads.readFirstRunOrientationSeen(),
    groupIds.length > 0
      ? reads.fetchLeaderGroupsByIds(groupIds)
      : Promise.resolve(null),
  ]);

  let groups: LeaderSafeGroupRow[] = [];
  if (groupsResult) {
    if (groupsResult.error) {
      return { kind: "load_error", error: groupsResult.error };
    }
    // Stable, friendly ordering by name.
    groups = (groupsResult.data ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return { kind: "ok", orientationSeen, groups };
}

// Production wrapper: bind the live client, or degrade to today's no-database
// defaults (orientation "seen", no groups) when Supabase env is absent.
export async function loadLeaderCareData(
  groupIds: string[]
): Promise<LeaderCareData> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "ok", orientationSeen: true, groups: [] };
  return measureReadBundle(
    "leader_landing",
    () => buildLeaderCareData(bindLeaderReads(client), groupIds),
    (result) => ({ result_kind: result.kind })
  );
}
