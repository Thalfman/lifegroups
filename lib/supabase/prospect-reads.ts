import type { ProspectState } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Read-model for the Interest Funnel board (#375). Column-allowlisted: the
// board only needs identity, state, and the attached group — never the audit /
// mutation columns (created_by, updated_by, updated_at) nor the reserved #379
// fields (next_step, additional_note). The row type is declared locally rather
// than Pick-ed from a generated ProspectsRow, since types/database.ts is not
// regenerated in this slice; the allowlist string and this type are the single
// place the board's shape is named.

export type ProspectBoardEntry = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: ProspectState;
  group_id: string | null;
  archived: boolean;
  created_at: string;
};

const PROSPECT_BOARD_COLUMNS =
  "id, full_name, email, phone, state, group_id, archived, created_at";

// Same default-cap rationale as fetchGuests: widen past PostgREST's ~1000 row
// default so funnel counts don't silently truncate.
const PROSPECT_PAGE_LIMIT = 10000;

/**
 * All Prospects, newest first, column-allowlisted. The board layer partitions
 * these into the active states and the collapsed Joined roll-up — keeping the
 * read a single round-trip and the partitioning pure/testable.
 */
export async function fetchProspects(
  client: ReadClient
): Promise<ReadResult<ProspectBoardEntry[]>> {
  const { data, error } = await client
    .from("prospects")
    .select(PROSPECT_BOARD_COLUMNS)
    .order("created_at", { ascending: false })
    .range(0, PROSPECT_PAGE_LIMIT - 1)
    .returns<ProspectBoardEntry[]>();
  if (error) return { data: null, error: wrapError("fetchProspects", error) };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Pure board composition (no I/O — testable with bare rows).
// ---------------------------------------------------------------------------

// The active board: the three live states, each with its Prospects. Joined is
// not a live column — it lives in the roll-up.
export const ACTIVE_BOARD_STATES: readonly ProspectState[] = [
  "interested",
  "matched",
  "not_at_this_time",
];

export type BoardColumn = {
  state: ProspectState;
  prospects: ProspectBoardEntry[];
};

// A collapsed Joined roll-up row: a joined Prospect with their group's name
// resolved. No count/roster row appears on the active board for these.
export type JoinedRollupEntry = {
  id: string;
  full_name: string;
  groupName: string | null;
};

export type ProspectBoard = {
  columns: BoardColumn[];
  joined: JoinedRollupEntry[];
};

/**
 * Partition Prospects into the active board (interested / matched /
 * not_at_this_time) and the collapsed Joined roll-up. Joined Prospects leave
 * the active board entirely (acceptance #4) — they appear only in the roll-up,
 * with their group name resolved from `groupNamesById`. Rows preserve the
 * read's newest-first order.
 */
export function buildProspectBoard(
  prospects: ProspectBoardEntry[],
  groupNamesById: Record<string, string>
): ProspectBoard {
  const byState = new Map<ProspectState, ProspectBoardEntry[]>();
  for (const state of ACTIVE_BOARD_STATES) byState.set(state, []);
  const joined: JoinedRollupEntry[] = [];

  for (const p of prospects) {
    // Joined / archived Prospects never appear as a board row.
    if (p.archived || p.state === "joined") {
      joined.push({
        id: p.id,
        full_name: p.full_name,
        groupName: p.group_id ? (groupNamesById[p.group_id] ?? null) : null,
      });
      continue;
    }
    const bucket = byState.get(p.state);
    if (bucket) bucket.push(p);
    // A non-archived row in an unexpected state is dropped from the active
    // board defensively; the funnel never produces one.
  }

  return {
    columns: ACTIVE_BOARD_STATES.map((state) => ({
      state,
      prospects: byState.get(state) ?? [],
    })),
    joined,
  };
}
