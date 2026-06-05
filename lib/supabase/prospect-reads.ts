import type { GroupLifecycleStatus, ProspectState } from "@/types/enums";
import {
  decodeNextStep,
  dueFollowUps,
  type DueFollowUp,
  type NextStep,
} from "@/lib/admin/prospect-next-step";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Read-model for the Interest Funnel board (#375, extended in #379). Column-
// allowlisted: the board needs identity, state, the attached group, plus the
// #379 Next Step + Additional Note fields. It never reads the audit / mutation
// columns (created_by, updated_by, updated_at). The row type is declared locally
// rather than Pick-ed from a generated ProspectsRow, since types/database.ts is
// not regenerated in this slice; the allowlist string and this type are the
// single place the board's shape is named. next_step arrives as raw jsonb and is
// decoded at the trust boundary (decodeNextStep) into the typed NextStep.

export type ProspectBoardEntry = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: ProspectState;
  group_id: string | null;
  archived: boolean;
  created_at: string;
  // #379: the single current Next Step (decoded from jsonb) and the separate
  // Additional Note. Either may be absent.
  next_step: NextStep | null;
  additional_note: string | null;
};

// The raw row as it comes back from PostgREST: next_step is untyped jsonb.
type ProspectRawRow = Omit<ProspectBoardEntry, "next_step"> & {
  next_step: unknown;
};

const PROSPECT_BOARD_COLUMNS =
  "id, full_name, email, phone, state, group_id, archived, created_at, next_step, additional_note";

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
    .returns<ProspectRawRow[]>();
  if (error) return { data: null, error: wrapError("fetchProspects", error) };
  // Decode the next_step jsonb into the typed NextStep at the trust boundary;
  // a malformed value decodes to null rather than throwing.
  const decoded: ProspectBoardEntry[] = (data ?? []).map((row) => ({
    ...row,
    next_step: decodeNextStep(row.next_step),
  }));
  return { data: decoded, error: null };
}

// Armed follow-ups that have come due, read DIRECTLY (not derived from the capped
// board page). The board read is newest-first and capped at PROSPECT_PAGE_LIMIT,
// so in a church with more prospects than the cap an older prospect's due
// follow-up would fall off the page and the reminder would be silently missed.
// This filters in the DB — non-archived, a dated `follow_up` step due on/before
// today — so the cap only ever bounds the (small) already-due set, then re-derives
// the canonical list purely via dueFollowUps. The jsonb path filters mirror
// decodeNextStep's stored snake_case keys (type / due_date).
const DUE_FOLLOW_UP_COLUMNS = "id, full_name, next_step";

type DueFollowUpRawRow = {
  id: string;
  full_name: string;
  next_step: unknown;
};

export async function fetchDueFollowUps(
  client: ReadClient,
  todayIso: string
): Promise<ReadResult<DueFollowUp[]>> {
  const { data, error } = await client
    .from("prospects")
    .select(DUE_FOLLOW_UP_COLUMNS)
    .eq("archived", false)
    // jsonb-path filters on the stored Next Step (snake_case keys, per
    // decodeNextStep): a dated follow_up step due on/before today.
    .eq("next_step->>type", "follow_up")
    .not("next_step->>due_date", "is", null)
    .lte("next_step->>due_date", todayIso)
    .range(0, PROSPECT_PAGE_LIMIT - 1)
    .returns<DueFollowUpRawRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchDueFollowUps", error) };
  // Re-derive purely so the DB filter and the UI's due rule share one tested home
  // (dueFollowUps also drops anything that doesn't normalize cleanly).
  const rows = ((data ?? []) as DueFollowUpRawRow[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    next_step: decodeNextStep(row.next_step),
  }));
  return { data: dueFollowUps(rows, todayIso), error: null };
}

// Narrow group-option read for the Plan board's Match/Join picker + roll-up
// labels. Allowlisted to id / name / lifecycle_status so the Interest Funnel
// render path never pulls privacy-sensitive group columns (e.g. admin_notes)
// that the shared fetchAllGroups' select("*") GroupsRow read would. The
// lifecycle lets the loader offer only live (non-closed) groups as targets.
export type PlanGroupRow = {
  id: string;
  name: string;
  lifecycle_status: GroupLifecycleStatus;
};

const PLAN_GROUP_COLUMNS = "id, name, lifecycle_status";

export async function fetchPlanGroupOptions(
  client: ReadClient
): Promise<ReadResult<PlanGroupRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select(PLAN_GROUP_COLUMNS)
    .order("name", { ascending: true })
    .returns<PlanGroupRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchPlanGroupOptions", error) };
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
