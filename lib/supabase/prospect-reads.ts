import type { GroupLifecycleStatus, ProspectState } from "@/types/enums";
import {
  decodeNextStep,
  dueFollowUps,
  type DueFollowUp,
  type NextStep,
} from "@/lib/admin/prospect-next-step";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

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

const PROSPECT_BOARD_COLUMNS = columns<ProspectBoardEntry>()(
  "id",
  "full_name",
  "email",
  "phone",
  "state",
  "group_id",
  "archived",
  "created_at",
  "next_step",
  "additional_note"
);

// Same default-cap rationale as fetchGuests: widen past PostgREST's ~1000 row
// default so funnel counts don't silently truncate.
const PROSPECT_PAGE_LIMIT = 10000;

/**
 * All board-relevant Prospects, newest first, column-allowlisted. The board
 * layer partitions these into the active states and the collapsed Joined
 * roll-up — keeping the read a single round-trip and the partitioning
 * pure/testable.
 *
 * Cleanup-archived rows (archived = true AND state <> 'joined') are excluded in
 * the DB, BEFORE the page cap: they never render (the board drops them), so
 * letting them consume the PROSPECT_PAGE_LIMIT budget could push older still-
 * active prospects off the page and make them vanish from the board. We keep
 * archived 'joined' rows (the Joined roll-up needs them) via the OR.
 */
export async function fetchProspects(
  client: ReadClient
): Promise<ReadResult<ProspectBoardEntry[]>> {
  const { data, error } = await client
    .from("prospects")
    .select(PROSPECT_BOARD_COLUMNS.select)
    // Active rows (archived = false) OR joined rows (always archived, shown in
    // the roll-up). This excludes only cleanup-archived non-joined rows.
    .or("archived.eq.false,state.eq.joined")
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

// ---------------------------------------------------------------------------
// Home overview counts (#470) — a NARROW count read, deliberately not the full
// board read above. The Home card renders counts only, so no identity or
// contact column may cross this seam: the allowlist is `state, archived` and
// nothing else. Rides the existing admin RLS on prospects — no policy change.
// ---------------------------------------------------------------------------

export type ProspectStateCounts = Record<ProspectState, number>;

const PROSPECT_STATE_COUNT_COLUMNS = columns<ProspectStateCountRow>()(
  "state",
  "archived"
);

type ProspectStateCountRow = {
  state: ProspectState;
  archived: boolean;
};

export const EMPTY_PROSPECT_STATE_COUNTS: ProspectStateCounts = {
  interested: 0,
  matched: 0,
  joined: 0,
  not_at_this_time: 0,
};

/**
 * Pure tally mirroring buildProspectBoard's partition rules so Home's counts
 * can never disagree with the Plan board: joined rows (always archived) count
 * toward the Joined roll-up; a cleanup-archived non-joined row counts nowhere;
 * every other row counts under its state.
 */
export function tallyProspectStateCounts(
  rows: ProspectStateCountRow[]
): ProspectStateCounts {
  const counts: ProspectStateCounts = { ...EMPTY_PROSPECT_STATE_COUNTS };
  for (const row of rows) {
    if (row.state === "joined") {
      counts.joined += 1;
      continue;
    }
    // Defensive parity with the board: the DB filter already excludes
    // cleanup-archived rows, but a stray one must not inflate a live state.
    if (row.archived) continue;
    counts[row.state] += 1;
  }
  return counts;
}

/**
 * Prospect counts by state for the Home Interest Funnel card. Same DB filter
 * and page cap as fetchProspects (live rows OR joined roll-up rows, cleanup-
 * archived rows excluded before the cap) so the card's counts agree with the
 * board. On failure the caller degrades the card to unavailable — never a
 * false zero.
 */
export async function fetchProspectStateCounts(
  client: ReadClient
): Promise<ReadResult<ProspectStateCounts>> {
  const { data, error } = await client
    .from("prospects")
    .select(PROSPECT_STATE_COUNT_COLUMNS.select)
    .or("archived.eq.false,state.eq.joined")
    .range(0, PROSPECT_PAGE_LIMIT - 1)
    .returns<ProspectStateCountRow[]>();
  if (error) {
    return { data: null, error: wrapError("fetchProspectStateCounts", error) };
  }
  return { data: tallyProspectStateCounts(data ?? []), error: null };
}

// Armed follow-ups that have come due, read DIRECTLY (not derived from the capped
// board page). The board read is newest-first and capped at PROSPECT_PAGE_LIMIT,
// so in a church with more prospects than the cap an older prospect's due
// follow-up would fall off the page and the reminder would be silently missed.
// This filters in the DB — non-archived, a dated `follow_up` step due on/before
// today — so the cap only ever bounds the (small) already-due set, then re-derives
// the canonical list purely via dueFollowUps. The jsonb path filters mirror
// decodeNextStep's stored snake_case keys (type / due_date).
const DUE_FOLLOW_UP_COLUMNS = columns<DueFollowUpRawRow>()(
  "id",
  "full_name",
  "next_step"
);

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
    .select(DUE_FOLLOW_UP_COLUMNS.select)
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

// ---------------------------------------------------------------------------
// Group-scoped funnel signals — the group detail People tab's view into the
// Interest Funnel. GROUP-LEVEL ONLY, deliberately: prospects carry no
// member/profile FK, so any per-person "came from prospect X" claim would be
// a name-match guess, not a fact. The tab shows who is being matched to THIS
// group and how many joined it through the funnel, nothing more.
// ---------------------------------------------------------------------------

export type GroupProspectSignals = {
  // Matched (blue) prospects attached to this group — follow-up under way.
  matched: Array<{ id: string; full_name: string }>;
  // Joined prospects (always archived into the roll-up) whose group was this
  // one — a count, since they're out of the active funnel.
  joinedCount: number;
};

const GROUP_PROSPECT_SIGNAL_COLUMNS = columns<GroupProspectSignalRow>()(
  "id",
  "full_name",
  "state",
  "archived"
);

type GroupProspectSignalRow = {
  id: string;
  full_name: string;
  state: ProspectState;
  archived: boolean;
};

/**
 * Pure partition mirroring buildProspectBoard's rules so the group detail can
 * never disagree with the Plan board: joined rows (always archived) count
 * toward joinedCount; cleanup-archived non-joined rows count nowhere; live
 * matched rows list by name. Interested / parked prospects aren't attached to
 * a group, so they never appear here.
 */
export function partitionGroupProspectSignals(
  rows: GroupProspectSignalRow[]
): GroupProspectSignals {
  const matched: GroupProspectSignals["matched"] = [];
  let joinedCount = 0;
  for (const row of rows) {
    if (row.state === "joined") {
      joinedCount += 1;
      continue;
    }
    if (row.archived) continue;
    if (row.state === "matched") {
      matched.push({ id: row.id, full_name: row.full_name });
    }
  }
  matched.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { matched, joinedCount };
}

/**
 * The funnel signals for one group, column-allowlisted (id / full_name /
 * state / archived — never contact or note columns). Same DB filter as the
 * board read: live rows OR joined roll-up rows; cleanup-archived rows are
 * excluded before the cap.
 */
export async function fetchProspectSignalsForGroup(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<GroupProspectSignals>> {
  const { data, error } = await client
    .from("prospects")
    .select(GROUP_PROSPECT_SIGNAL_COLUMNS.select)
    .eq("group_id", groupId)
    .or("archived.eq.false,state.eq.joined")
    .range(0, PROSPECT_PAGE_LIMIT - 1)
    .returns<GroupProspectSignalRow[]>();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchProspectSignalsForGroup", error),
    };
  }
  return { data: partitionGroupProspectSignals(data ?? []), error: null };
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

const PLAN_GROUP_COLUMNS = columns<PlanGroupRow>()(
  "id",
  "name",
  "lifecycle_status"
);

export async function fetchPlanGroupOptions(
  client: ReadClient
): Promise<ReadResult<PlanGroupRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select(PLAN_GROUP_COLUMNS.select)
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
    // Joined Prospects (always archived) live only in the collapsed roll-up.
    if (p.state === "joined") {
      joined.push({
        id: p.id,
        full_name: p.full_name,
        groupName: p.group_id ? (groupNamesById[p.group_id] ?? null) : null,
      });
      continue;
    }
    // A Prospect archived for cleanup (archived but NOT joined) leaves the board
    // entirely — it is neither an active card nor a "joined" outcome, so it must
    // not be dumped into the Joined roll-up.
    if (p.archived) continue;
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
