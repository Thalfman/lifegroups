import "server-only";

import { churchDayStartUtcIso } from "@/lib/shared/church-time";
import { readBatch } from "./read-batch";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
// fetchOpenFollowUps is a leader-safe dashboard reader; it uses the follow-up
// column allowlist + row type that live in follow-up-reads.
import {
  LEADER_FOLLOW_UP_COLUMNS,
  type LeaderFollowUpRow,
} from "./follow-up-reads";

export type OverviewActivityCounts = {
  membersJoined: number;
  followUpsCompleted: number;
  careTouchpoints: number;
  prospectsAdded: number;
};

// Counts of dated activity within [fromIso, toExclusiveIso) for the executive
// overview's period band. `fromIso` null means all-time (upper bound only).
// Head-only count queries keep this cheap. Groups launched and guests welcomed
// are derived from arrays the dashboard already fetches, so they are NOT read
// here. Prospects added (#471) counts `prospects.created_at` — the live
// Interest Funnel intake, replacing the frozen-guests "Guests welcomed" tile.
// Archived Prospects still count: the tile measures intake activity in the
// period, not the funnel's current state.
//
// joined_at and interaction_at are DATE columns (church-local calendar days),
// so the YYYY-MM-DD bounds compare directly. completed_at and created_at are
// timestamptz, so their bounds are converted to the matching UTC instants of
// church-local midnight — otherwise a late-evening-local row (which Postgres
// reads as the next UTC day) would land in the wrong period.
export async function fetchOverviewActivityCounts(
  client: ReadClient,
  range: { fromIso: string | null; toExclusiveIso: string }
): Promise<ReadResult<OverviewActivityCounts>> {
  let membersQ = client
    .from("group_memberships")
    .select("id", { count: "exact", head: true })
    .lt("joined_at", range.toExclusiveIso);
  if (range.fromIso) membersQ = membersQ.gte("joined_at", range.fromIso);

  let followUpsQ = client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .not("completed_at", "is", null)
    .lt("completed_at", churchDayStartUtcIso(range.toExclusiveIso));
  if (range.fromIso)
    followUpsQ = followUpsQ.gte(
      "completed_at",
      churchDayStartUtcIso(range.fromIso)
    );

  let interactionsQ = client
    .from("shepherd_care_interactions")
    .select("id", { count: "exact", head: true })
    .lt("interaction_at", range.toExclusiveIso);
  if (range.fromIso)
    interactionsQ = interactionsQ.gte("interaction_at", range.fromIso);

  let prospectsQ = client
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .lt("created_at", churchDayStartUtcIso(range.toExclusiveIso));
  if (range.fromIso)
    prospectsQ = prospectsQ.gte(
      "created_at",
      churchDayStartUtcIso(range.fromIso)
    );

  // Gather-and-degrade through readBatch (ADR 0015) instead of a hand-rolled
  // error chain; declaration order keeps the members-first error precedence.
  const countThunk =
    (query: PromiseLike<{ count: number | null; error: unknown }>) =>
    async (): Promise<ReadResult<number>> => {
      const { count, error } = await query;
      if (error)
        return {
          data: null,
          error: wrapError("fetchOverviewActivityCounts", error),
        };
      return { data: count ?? 0, error: null };
    };

  const batch = await readBatch({
    members: countThunk(membersQ),
    followUps: countThunk(followUpsQ),
    interactions: countThunk(interactionsQ),
    prospects: countThunk(prospectsQ),
  });
  if (batch.firstError !== null)
    return { data: null, error: new Error(batch.firstError) };

  return {
    data: {
      membersJoined: batch.results.members.data ?? 0,
      followUpsCompleted: batch.results.followUps.data ?? 0,
      careTouchpoints: batch.results.interactions.data ?? 0,
      prospectsAdded: batch.results.prospects.data ?? 0,
    },
    error: null,
  };
}

/**
 * Open follow-ups summary helper used by both the admin dashboard
 * (`getAdminDashboardData`) and the per-group leader dashboard
 * (`buildLeaderGroupDashboard`).
 *
 * Selects via {@link LEADER_FOLLOW_UP_COLUMNS} and returns
 * {@link LeaderFollowUpRow}, i.e. **never** includes `admin_private_note`.
 * Admin surfaces that genuinely need the admin-private note (only
 * `/admin/follow-ups` today) must use {@link fetchFollowUpsForAdmin}
 * instead. The narrowing here matters because this helper is reachable
 * from the leader request path — Phase 5C.1 hardened it so the SQL-level
 * privacy claim holds, not just the rendered-output claim.
 */
export async function fetchOpenFollowUps(
  client: ReadClient,
  options: { groupId?: string; limit?: number } = {}
): Promise<ReadResult<LeaderFollowUpRow[]>> {
  let query = client
    .from("follow_ups")
    .select(LEADER_FOLLOW_UP_COLUMNS.select)
    .in("status", ["open", "in_progress"])
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (options.groupId) query = query.eq("related_group_id", options.groupId);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query.returns<LeaderFollowUpRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchOpenFollowUps", error) };
  return { data: data ?? [], error: null };
}

/**
 * Accurate, UNtruncated count of OPEN follow-ups due within the "this week"
 * window — anything with a `due_date` on or before `dueOnOrBeforeIso`
 * (inclusive of today and anything already overdue), matching the
 * `isDueThisWeek` horizon the Home "This week" card renders.
 *
 * The card itself can only see the first `limit` rows of {@link fetchOpenFollowUps}
 * (ordered by priority then due_date), so a lower-priority item due this week can
 * fall outside that cap and be undercounted. This is a `head:true` exact count —
 * it reads no rows, just the total — so the card can show a faithful figure
 * without lifting the row cap. Open == `status in ('open','in_progress')`, the
 * same predicate `fetchOpenFollowUps` uses.
 */
export async function fetchOpenFollowUpsDueCount(
  client: ReadClient,
  options: { dueOnOrBeforeIso: string }
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"])
    .not("due_date", "is", null)
    .lte("due_date", options.dueOnOrBeforeIso);
  if (error)
    return {
      data: null,
      error: wrapError("fetchOpenFollowUpsDueCount", error),
    };
  return { data: count ?? 0, error: null };
}
