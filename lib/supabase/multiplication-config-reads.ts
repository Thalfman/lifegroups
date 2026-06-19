import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";
import {
  columns,
  wrapError,
  decodeNumericRecord,
  type ReadClient,
  type ReadResult,
} from "./read-core";
import { countActiveMembersByGroup } from "@/lib/admin/group-capacity-inputs";
import { isAudienceCategory } from "@/lib/admin/audience";
import { cellKey } from "@/lib/admin/cell-coordinate";
import { wholeYearsBetween } from "@/lib/admin/multiplication";
import {
  tallyCellHealthGrades,
  type CellHealthGrades,
  type ResolvedCellGroupGrade,
  type ResolvedCellLeaderGrade,
} from "@/lib/admin/cell-health";
import { fetchHealthRubric } from "./health-rubric-reads";
import {
  tallyCellInterest,
  type CellInterestTally,
  type InterestProspectRow,
} from "@/lib/admin/prospect-interest";
import type {
  GradeOverride,
  GradeOverrideScope,
} from "@/lib/admin/group-health-override";
import {
  decodeRubricCriteria,
  type Rubric,
  type RubricScores,
} from "@/lib/admin/health-rubric";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";

// Multiplication config + per-cell read models (#380, updated #401/#403). Reads
// that feed the Multiply surface:
//   1. fetchMultiplicationConfigs — the per-(type, ministry-year) config rows
//      (thresholds + trigger), column-allowlisted. RLS already restricts SELECT
//      to admins (belt-and-braces, matching the health-rubric reads idiom). The
//      fed-capacity column was retired in #401 — capacity is now derived.
//   2. fetchCellInterestCounts — the interest HEADCOUNT per CELL (#399/#403): the
//      count of interested-state, non-archived prospects whose DESIRED cell (top
//      type × category, named at intake) is each cell. Feeds the per-cell
//      readiness rule's Interest pillar in its natural unit (people).
//   3. fetchCellActiveGroupSizes — per-CELL active group member counts (#401),
//      the input to the derived per-cell capacity ISSUE resolver.
//   4. fetchCellHealthGrades — per-CELL Group/Leader Health A–F grade arrays
//      (#403), feeding the readiness rule's two health pillars per cell.
//
// The config row's two jsonb columns are decoded into typed config at the trust
// boundary (lib/admin/multiplication-pillars.ts); the row type here stays raw.
//
// #403 retired the per-TYPE roll-ups (fetchFunnelVolumeByType /
// fetchHealthGradesByType) that fed the old per-type Multiply boards: the boards
// folded into the per-cell grid, so interest and health are now read per CELL.

// #401: `fed_capacity` is removed from the allowlist — the column was dropped by
// the retire-fed-capacity migration and capacity is now a derived per-cell issue.
// One persisted config row, as read through the allowlist. The two jsonb fields
// are raw; the caller decodes them with decodePillarThresholds / etc. The
// allowlist below is pinned to this type via `columns<…>()`.
export type MultiplicationConfigRow = {
  id: string;
  group_type: GroupAudienceCategory;
  ministry_year: number;
  thresholds: unknown;
  trigger_rubric: unknown;
  updated_at: string;
};

export const MULTIPLICATION_CONFIG_COLUMNS = columns<MultiplicationConfigRow>()(
  "id",
  "group_type",
  "ministry_year",
  "thresholds",
  "trigger_rubric",
  "updated_at"
);

// Fetch all config rows for a ministry year (one per group type at most). An
// empty result is the success-with-empty case — a fresh ministry has no config
// until Julian sets it; the board falls back to built-in thresholds.
export async function fetchMultiplicationConfigs(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<MultiplicationConfigRow[]>> {
  const { data, error } = await client
    .from("multiplication_config")
    .select(MULTIPLICATION_CONFIG_COLUMNS.select)
    .eq("ministry_year", ministryYear)
    .returns<MultiplicationConfigRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("multiplication_config", error),
    };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Interest headcount per CELL — the desired-cell tally (#399/#403).
// ---------------------------------------------------------------------------
//
// Interest (ADR 0016) is the per-cell desired-cell HEADCOUNT: the count of
// prospects in state `interested` (NOT matched/joined/not_at_this_time) and not
// archived whose DESIRED cell (top type × category, named at intake) is each
// cell. A prospect who named no desired cell — or who has moved past raw
// interest — contributes nothing. The state-filtering + per-cell keying live in
// the pure lib/admin/prospect-interest core; this read just supplies it bare
// rows. The per-cell grid (#403) reads each cell's count directly via
// interestForCell; the old per-type roll-up was retired with the boards.

export const EMPTY_CELL_INTEREST: CellInterestTally = {};

// The desired-cell + state/archived columns the tally needs. Allowlisted —
// never select("*"); RLS already restricts SELECT to admins (belt-and-braces).
const INTEREST_VOLUME_COLUMNS = columns<InterestProspectRow>()(
  "state",
  "archived",
  "desired_audience_category",
  "desired_category_id"
);
const INTEREST_PAGE_LIMIT = 10000;

// Per-cell interest headcount from the prospects' desired cells. Filters archived
// rows AND rows with no desired cell in the DB before the page cap, so a church
// with >INTEREST_PAGE_LIMIT historical or cell-less prospects can't push the
// countable interested ones off the first page and understate a cell. Only
// interested-state prospects with a fully-named desired cell count (also
// re-enforced in tallyCellInterest).
export async function fetchCellInterestCounts(
  client: ReadClient
): Promise<ReadResult<CellInterestTally>> {
  const { data, error } = await client
    .from("prospects")
    .select(INTEREST_VOLUME_COLUMNS.select)
    .eq("archived", false)
    .eq("state", "interested")
    .not("desired_audience_category", "is", null)
    .not("desired_category_id", "is", null)
    .range(0, INTEREST_PAGE_LIMIT - 1)
    .returns<InterestProspectRow[]>();

  if (error)
    return { data: null, error: wrapError("fetchCellInterestCounts", error) };

  return { data: tallyCellInterest(data ?? []), error: null };
}

// ---------------------------------------------------------------------------
// Per-CELL active group sizes (#401) — input to the derived capacity ISSUE.
// ---------------------------------------------------------------------------
//
// A "cell" = (audience_category ∈ {men,women,mixed}) × (category_id →
// group_categories). The derived capacity issue (lib/admin/cell-capacity.ts) is
// computed per cell from the ACTIVE member counts of the groups in it. This read
// returns, per cell, the array of active group sizes; the surface rolls those up.
//
// The CONSIDERED cells are the ACTIVE `category_type_targets` cells, NOT whatever
// cells happen to have groups. This matters two ways (PRD §2.3/§2.4):
//   * an active cell with NO active groups must still appear (seeded `[]`) so its
//     thin-availability facet can trip — otherwise it would vanish from the
//     rollup and the banner could read "no issue" for a cell with nothing to join;
//   * an UNCATEGORIZED active group (null category_id) belongs to no category cell
//     and must never synthesize one, which would otherwise produce a false issue.
// The read stays column-allowlisted (reads seam, ADR 0015): we project exactly the
// cell-keying columns + the per-group active membership, never select("*").
//
// We read groups + group_memberships and aggregate PURELY (the count idiom mirrors
// lib/admin/capacity-board.ts `buildCapacityBoardModel`: a group's member count is
// its number of group_memberships rows with status='active'). All three reads are
// PAGED through to completion — a church with more active memberships (or groups)
// than one PostgREST page would otherwise silently truncate the counts, under-
// reading group sizes and mis-grading capacity.

// One active-group row for the cell read: its id + the two cell-keying columns. A
// null `category_id` means the group is uncategorized and so in no category cell.
type CellGroupRow = {
  id: string;
  audience_category: GroupAudienceCategory | null;
  category_id: string | null;
  lifecycle_status: string | null;
};

type CellMembershipRow = {
  group_id: string;
  status: string | null;
};

// One ACTIVE cell row from category_type_targets — the cell-keying columns only.
// These seed the considered cells; target_count and the rest are not needed here.
type ActiveCellRow = {
  audience_category: GroupAudienceCategory | null;
  category_id: string | null;
};

const CELL_GROUP_COLUMNS = columns<CellGroupRow>()(
  "id",
  "audience_category",
  "category_id",
  "lifecycle_status"
);
const CELL_MEMBERSHIP_COLUMNS = columns<CellMembershipRow>()(
  "group_id",
  "status"
);
const ACTIVE_CELL_COLUMNS = columns<ActiveCellRow>()(
  "audience_category",
  "category_id"
);

// Page size for the cell reads. We page through until a short page rather than
// trusting a single fixed window, so the derived capacity is never computed from a
// truncated set of memberships/groups.
const CELL_PAGE_SIZE = 1000;

// A cell key: audience type + category id (null when the group has no category).
export type CellKey = {
  audience: GroupAudienceCategory;
  categoryId: string | null;
};

// The per-cell active group sizes: keyed by the canonical Cell coordinate key
// (cellKey) so callers index without juggling tuples. Each value is the array of
// ACTIVE member counts of the active groups in that cell.
export type CellActiveGroupSizes = {
  // Stable key → the cell's active group sizes.
  byCell: Map<string, number[]>;
  // The same key → its decomposed parts, for callers that need the audience/cat.
  keys: Map<string, CellKey>;
};

// Pure aggregator (exported for testing): bucket each ACTIVE group's active member
// count under its cell, with EVERY active cell pre-seeded to an empty list. The
// considered cells are the ACTIVE `category_type_targets` cells (`activeCells`),
// not whatever cells happen to have groups — so an active cell with no active
// groups still appears (seeded `[]`, tripping thin availability) and an
// uncategorized group (null category_id) never synthesizes a cell. A group's size
// is its count of active memberships (0 when it has none); a group whose cell is
// not an active target is outside the matrix and dropped.
export function tallyCellActiveGroupSizes(
  groups: readonly CellGroupRow[],
  memberships: readonly CellMembershipRow[],
  activeCells: readonly CellKey[]
): CellActiveGroupSizes {
  // Active-membership count per group id (the shared capacity-input rule).
  const activeCountByGroup = countActiveMembersByGroup(memberships);

  // Seed every ACTIVE cell with an empty size list so a configured cell with no
  // active groups still appears in the rollup (and trips Facet B) rather than
  // vanishing. A null-category or non-audience cell row is ignored defensively.
  const byCell = new Map<string, number[]>();
  const keys = new Map<string, CellKey>();
  for (const cell of activeCells) {
    const audience = cell.audience;
    if (!isAudienceCategory(audience)) {
      continue;
    }
    if (cell.categoryId == null) continue;
    const key = cellKey({ audience, categoryId: cell.categoryId });
    if (!byCell.has(key)) {
      byCell.set(key, []);
      keys.set(key, { audience, categoryId: cell.categoryId });
    }
  }

  for (const g of groups) {
    if (g.lifecycle_status !== "active") continue;
    const audience = g.audience_category;
    if (!isAudienceCategory(audience)) {
      continue;
    }
    // An uncategorized group (null category_id) is in no category cell, so it
    // never feeds a cell's capacity (PRD §2.3 / §2.4).
    if (g.category_id == null) continue;
    const key = cellKey({ audience, categoryId: g.category_id });
    // Only ACTIVE cells are considered: a group whose cell isn't an active target
    // is outside the capacity matrix and is dropped.
    const list = byCell.get(key);
    if (!list) continue;
    list.push(activeCountByGroup.get(g.id) ?? 0);
  }

  return { byCell, keys };
}

export const EMPTY_CELL_ACTIVE_GROUP_SIZES: CellActiveGroupSizes = {
  byCell: new Map(),
  keys: new Map(),
};

// ---------------------------------------------------------------------------
// Per-CELL group maturity (#483) — inputs to the three new readiness pillars.
// ---------------------------------------------------------------------------
//
// The member-count / group-tenure / Co-Leader-tenure pillars (lib/admin/cell-
// readiness.ts) are Julian's per-GROUP multiplication criteria folded into the
// per-CELL rule. A cell is "ready to multiply" when its STRONGEST group is, so
// each pillar reads the BEST group in the cell: the max group tenure (years since
// groups.launched_on) and the max Co-Leader tenure (years since the earliest
// ACTIVE co_leader's group_leaders.assigned_at). Member count is the max active
// roster size, already read per cell by fetchCellActiveGroupSizes — so this read
// supplies only the two TENURE maxima, computed in whole years against today.
//
// Same considered-cells discipline as the sizes read: the ACTIVE
// category_type_targets cells seed the map, and only active, categorised groups in
// an active cell contribute. A cell with no qualifying group keeps null (an
// ungrounded tenure → blocks a required pillar, mirroring an ungraded health
// letter). Column-allowlisted + paged, like its sibling.

export type CellMaturityCell = {
  // The cell's BEST (max) EFFECTIVE member count across its active groups — the
  // Julian-fed manual_member_count when set, else the in-app active roster count
  // (ADR 0022: the manual count is the source of truth for the "12+ members"
  // criterion). 0 when the cell has no active groups.
  memberCount: number;
  // The cell's max group tenure and Co-Leader tenure in whole years, or null when
  // no active group in the cell supplies one.
  groupTenureYears: number | null;
  coShepherdTenureYears: number | null;
};

export type CellMaturity = {
  // Stable cell key → the cell's readiness maturity (max across its groups).
  byCell: Map<string, CellMaturityCell>;
};

export const EMPTY_CELL_MATURITY: CellMaturity = { byCell: new Map() };

// One active-group row for the maturity read: the cell-keying columns plus the
// launch date the group-tenure pillar reads.
type CellMaturityGroupRow = {
  id: string;
  audience_category: GroupAudienceCategory | null;
  category_id: string | null;
  lifecycle_status: string | null;
  launched_on: string | null;
};

// One active co_leader leadership row: the group it serves, when it began, and
// the holder's CURRENT profile role. A profile converted away from leadership can
// leave an active group_leaders row behind (os7 predicate: group_leaders rows
// don't cascade on a role change), so the row's own role/active flags aren't
// enough — the profile must still BE a leader/co_leader, mirroring the health
// rollup's profiles(role) guard.
type CellCoLeaderRow = {
  group_id: string;
  assigned_at: string | null;
  profile: { role: string | null } | null;
};

// One active multiplication candidate's Julian-fed headcount for its group.
type CellManualCountRow = {
  group_id: string;
  manual_member_count: number | null;
};

const CELL_MATURITY_GROUP_COLUMNS = columns<CellMaturityGroupRow>()(
  "id",
  "audience_category",
  "category_id",
  "lifecycle_status",
  "launched_on"
);
// Named-column select WITH the profiles(role) join (so the helper's flat-column
// allowlist doesn't apply) — still explicit columns, never select("*").
const CELL_CO_LEADER_SELECT = "group_id, assigned_at, profile:profiles(role)";
const CELL_MANUAL_COUNT_COLUMNS = columns<CellManualCountRow>()(
  "group_id",
  "manual_member_count"
);

// Pure aggregator (exported for testing): bucket each ACTIVE group's maturity
// maxima under its cell, with every active cell pre-seeded. A group's member
// count is the Julian-fed manual_member_count when set, else its active roster
// count (ADR 0022); its Co-Leader tenure reads the EARLIEST active co_leader
// assignment (the longest-serving co-leader gives the strongest signal). Member
// count maxes from 0; both tenures max from null (a cell with no qualifying group
// stays null). All against `todayIso`.
export function tallyCellMaturity(
  groups: readonly CellMaturityGroupRow[],
  coLeaders: readonly CellCoLeaderRow[],
  memberships: readonly CellMembershipRow[],
  manualCounts: readonly CellManualCountRow[],
  activeCells: readonly CellKey[],
  todayIso: string
): CellMaturity {
  // Earliest active co_leader assignment per group → the max Co-Leader tenure. A
  // stale row whose profile is no longer a leader/co_leader is skipped (os7),
  // so an ex-co-leader can't keep a cell "ready".
  const earliestCoLeaderByGroup = new Map<string, string>();
  for (const cl of coLeaders) {
    if (!cl.group_id || !cl.assigned_at) continue;
    const role = cl.profile?.role ?? null;
    if (role !== "leader" && role !== "co_leader") continue;
    const current = earliestCoLeaderByGroup.get(cl.group_id);
    if (current === undefined || cl.assigned_at < current) {
      earliestCoLeaderByGroup.set(cl.group_id, cl.assigned_at);
    }
  }

  // Active roster count per group (the capacity-board count idiom) and the
  // Julian-fed manual count that overrides it for the "12+ members" criterion.
  const rosterCountByGroup = countActiveMembersByGroup(memberships);
  const manualCountByGroup = new Map<string, number>();
  for (const row of manualCounts) {
    if (row.group_id && typeof row.manual_member_count === "number") {
      manualCountByGroup.set(row.group_id, row.manual_member_count);
    }
  }

  const byCell = new Map<string, CellMaturityCell>();
  for (const cell of activeCells) {
    if (!isAudienceCategory(cell.audience)) continue;
    if (cell.categoryId == null) continue;
    const key = cellKey({
      audience: cell.audience,
      categoryId: cell.categoryId,
    });
    if (!byCell.has(key)) {
      byCell.set(key, {
        memberCount: 0,
        groupTenureYears: null,
        coShepherdTenureYears: null,
      });
    }
  }

  const maxOrKeep = (
    current: number | null,
    next: number | null
  ): number | null => {
    if (next === null) return current;
    return current === null ? next : Math.max(current, next);
  };

  for (const g of groups) {
    if (g.lifecycle_status !== "active") continue;
    const audience = g.audience_category;
    if (!isAudienceCategory(audience)) continue;
    if (g.category_id == null) continue;
    const key = cellKey({ audience, categoryId: g.category_id });
    const acc = byCell.get(key);
    if (!acc) continue;
    // Effective count: the manual headcount wins; else the roster count (0 when
    // the group has no active members).
    const effectiveCount =
      manualCountByGroup.get(g.id) ?? rosterCountByGroup.get(g.id) ?? 0;
    acc.memberCount = Math.max(acc.memberCount, effectiveCount);
    acc.groupTenureYears = maxOrKeep(
      acc.groupTenureYears,
      wholeYearsBetween(g.launched_on, todayIso)
    );
    acc.coShepherdTenureYears = maxOrKeep(
      acc.coShepherdTenureYears,
      wholeYearsBetween(earliestCoLeaderByGroup.get(g.id) ?? null, todayIso)
    );
  }

  return { byCell };
}

// Read the per-cell member-count + tenure maxima: active groups (with launch
// date), active co_leader leadership rows (with assignment date), active
// memberships + the Julian-fed manual counts (for the effective member count),
// and the active cells to seed the considered set, then aggregate purely against
// today. All reads page through to completion so a large ministry isn't
// truncated. A read failure surfaces so the grid notes it rather than evaluating
// these pillars on a partial set.
export async function fetchCellGroupMaturity(
  client: ReadClient,
  todayIso: string
): Promise<ReadResult<CellMaturity>> {
  const [groupsRes, coLeadersRes, membershipsRes, manualCountsRes, cellsRes] =
    await Promise.all([
      fetchAllPages<CellMaturityGroupRow>((from, to) =>
        client
          .from("groups")
          .select(CELL_MATURITY_GROUP_COLUMNS.select)
          .eq("lifecycle_status", "active")
          .range(from, to)
          .returns<CellMaturityGroupRow[]>()
      ),
      fetchAllPages<CellCoLeaderRow>((from, to) =>
        client
          .from("group_leaders")
          .select(CELL_CO_LEADER_SELECT)
          .eq("active", true)
          .eq("role", "co_leader")
          .range(from, to)
          .returns<CellCoLeaderRow[]>()
      ),
      fetchAllPages<CellMembershipRow>((from, to) =>
        client
          .from("group_memberships")
          .select(CELL_MEMBERSHIP_COLUMNS.select)
          .eq("status", "active")
          .range(from, to)
          .returns<CellMembershipRow[]>()
      ),
      fetchAllPages<CellManualCountRow>((from, to) =>
        client
          .from("multiplication_candidates")
          .select(CELL_MANUAL_COUNT_COLUMNS.select)
          .is("archived_at", null)
          .not("manual_member_count", "is", null)
          .range(from, to)
          .returns<CellManualCountRow[]>()
      ),
      fetchAllPages<ActiveCellRow>((from, to) =>
        client
          .from("category_type_targets")
          .select(ACTIVE_CELL_COLUMNS.select)
          .eq("active", true)
          .range(from, to)
          .returns<ActiveCellRow[]>()
      ),
    ]);

  if (groupsRes.error)
    return {
      data: null,
      error: wrapError("fetchCellGroupMaturity/groups", groupsRes.error),
    };
  if (coLeadersRes.error)
    return {
      data: null,
      error: wrapError("fetchCellGroupMaturity/coLeaders", coLeadersRes.error),
    };
  if (membershipsRes.error)
    return {
      data: null,
      error: wrapError(
        "fetchCellGroupMaturity/memberships",
        membershipsRes.error
      ),
    };
  if (manualCountsRes.error)
    return {
      data: null,
      error: wrapError(
        "fetchCellGroupMaturity/manualCounts",
        manualCountsRes.error
      ),
    };
  if (cellsRes.error)
    return {
      data: null,
      error: wrapError("fetchCellGroupMaturity/cells", cellsRes.error),
    };

  const activeCells: CellKey[] = [];
  for (const cell of cellsRes.data ?? []) {
    const audience = cell.audience_category;
    if (!isAudienceCategory(audience)) continue;
    if (cell.category_id == null) continue;
    activeCells.push({ audience, categoryId: cell.category_id });
  }

  return {
    data: tallyCellMaturity(
      groupsRes.data ?? [],
      coLeadersRes.data ?? [],
      membershipsRes.data ?? [],
      manualCountsRes.data ?? [],
      activeCells,
      todayIso
    ),
    error: null,
  };
}

// Page a single PostgREST read through to completion: re-issues the query with a
// sliding `range` window until a short page comes back, so the caller never grades
// on a truncated set. The factory rebuilds the (single-use) query per page.
async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[] | null; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += CELL_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + CELL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    all.push(...page);
    if (page.length < CELL_PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

// Read the per-cell active group sizes: the ACTIVE cells (to seed the considered
// set), active groups (id + cell-keying columns), and their active memberships,
// then aggregate purely. All three reads page through to completion so capacity is
// never derived from a truncated set. A read failure surfaces as an error so the
// board notes it rather than grading capacity on partial data.
export async function fetchCellActiveGroupSizes(
  client: ReadClient
): Promise<ReadResult<CellActiveGroupSizes>> {
  const [groupsRes, membershipsRes, cellsRes] = await Promise.all([
    fetchAllPages<CellGroupRow>((from, to) =>
      client
        .from("groups")
        .select(CELL_GROUP_COLUMNS.select)
        .eq("lifecycle_status", "active")
        .range(from, to)
        .returns<CellGroupRow[]>()
    ),
    fetchAllPages<CellMembershipRow>((from, to) =>
      client
        .from("group_memberships")
        .select(CELL_MEMBERSHIP_COLUMNS.select)
        .eq("status", "active")
        .range(from, to)
        .returns<CellMembershipRow[]>()
    ),
    fetchAllPages<ActiveCellRow>((from, to) =>
      client
        .from("category_type_targets")
        .select(ACTIVE_CELL_COLUMNS.select)
        .eq("active", true)
        .range(from, to)
        .returns<ActiveCellRow[]>()
    ),
  ]);

  if (groupsRes.error)
    return {
      data: null,
      error: wrapError("fetchCellActiveGroupSizes/groups", groupsRes.error),
    };
  if (membershipsRes.error)
    return {
      data: null,
      error: wrapError(
        "fetchCellActiveGroupSizes/memberships",
        membershipsRes.error
      ),
    };
  if (cellsRes.error)
    return {
      data: null,
      error: wrapError("fetchCellActiveGroupSizes/cells", cellsRes.error),
    };

  // The considered cells: active category_type_targets rows with a real audience
  // and category. The pure tally seeds these and buckets only into them.
  const activeCells: CellKey[] = [];
  for (const cell of cellsRes.data ?? []) {
    const audience = cell.audience_category;
    if (!isAudienceCategory(audience)) {
      continue;
    }
    if (cell.category_id == null) continue;
    activeCells.push({ audience, categoryId: cell.category_id });
  }

  return {
    data: tallyCellActiveGroupSizes(
      groupsRes.data ?? [],
      membershipsRes.data ?? [],
      activeCells
    ),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Group/Leader Health grade roll-up per CELL (#377/#378 → #380 → #403).
// ---------------------------------------------------------------------------
//
// The Multiply grid's Group Health and Leader Health pillars roll up each cell's
// rubric grades over the Ministry Year. We RECOMPUTE each grade's effective letter
// live from its stored criterion_scores against the CURRENT rubric — never the
// possibly-stale persisted computed_letter — exactly as the Care detail readers
// do, so the grid and the grade editor always agree even after a rubric edit.
// The shared override resolver then applies the this-month/until-cleared expiry.
// Grades bucket by CELL (type × category); a group with no category, or a leader's
// group with no category, contributes to no cell. A leader spanning more than one
// cell contributes to every cell they actively lead. A cell with no grades is
// simply absent from the map (the grid rolls an absent cell up to "—").

// The override + scores slice of a grade row, shared by both grade tables. The
// effective letter is recomputed from `criterion_scores`; `computed_letter` is
// deliberately NOT read here (it can lag the current rubric).
type GradeScoreFields = {
  criterion_scores: unknown;
  override_letter: GroupHealthLetter | null;
  override_scope: GradeOverrideScope | null;
  override_period_month: string | null;
};

// Decode a stored grade row's override columns into the structured override the
// grade facades consume, or null when no override is set. The this-month expiry
// pivots on the override's own stored month (falling back to the period only when
// the row never recorded one), never the current period.
function rowGradeOverride(
  row: Pick<
    GradeScoreFields,
    "override_letter" | "override_scope" | "override_period_month"
  >,
  periodMonthIso: string
): GradeOverride | null {
  if (!row.override_letter || !row.override_scope) return null;
  return {
    letter: row.override_letter,
    scope: row.override_scope,
    period_month: row.override_period_month ?? periodMonthIso,
  };
}

type GroupGradeJoinRow = GradeScoreFields & {
  group: {
    audience_category: GroupAudienceCategory | null;
    category_id: string | null;
    lifecycle_status: string | null;
  } | null;
};

type LeaderGradeRow = GradeScoreFields & { profile_id: string };

type LeaderCellJoinRow = {
  profile_id: string;
  group: {
    audience_category: GroupAudienceCategory | null;
    category_id: string | null;
    lifecycle_status: string | null;
  } | null;
  profile: { role: string | null } | null;
};

const GRADE_SCORE_COLUMNS = columns<GradeScoreFields>()(
  "criterion_scores",
  "override_letter",
  "override_scope",
  "override_period_month"
);

// Page cap for the rollup reads, mirroring the interest read. A ministry year with
// more grade rows than this would otherwise be silently truncated by PostgREST's
// default page size and grade the pillar on a partial set.
const HEALTH_GRADE_PAGE_LIMIT = 10000;

// The per-cell health grade types, the empty map, and the pure bucketer
// (`tallyCellHealthGrades`) now live in lib/admin/cell-health.ts — the one home
// for the Cell Health concept. This read resolves each grade to its effective
// letter, then hands the bare rows to that bucketer.

// Read + resolve the per-CELL Group/Leader Health grade arrays for a ministry
// year. Reads both rubrics (to recompute live), the two grade tables' scores +
// overrides, and the active leader→cell map, then resolves + buckets purely. A
// read failure surfaces as an error so the grid notes it rather than silently
// grading on partial data.
export async function fetchCellHealthGrades(
  client: ReadClient,
  ministryYear: number,
  periodMonthIso: string
): Promise<ReadResult<CellHealthGrades>> {
  const [groupRubricRes, leaderRubricRes, groupRes, leaderRes, leaderCellRes] =
    await Promise.all([
      fetchHealthRubric(client, "group"),
      fetchHealthRubric(client, "leader"),
      client
        .from("group_rubric_grades")
        .select(
          `${GRADE_SCORE_COLUMNS.select}, group:groups(audience_category, category_id, lifecycle_status)`
        )
        .eq("ministry_year", ministryYear)
        .range(0, HEALTH_GRADE_PAGE_LIMIT - 1)
        .returns<GroupGradeJoinRow[]>(),
      client
        .from("leader_rubric_grades")
        .select(`profile_id, ${GRADE_SCORE_COLUMNS.select}`)
        .eq("ministry_year", ministryYear)
        .range(0, HEALTH_GRADE_PAGE_LIMIT - 1)
        .returns<LeaderGradeRow[]>(),
      client
        .from("group_leaders")
        // profile:profiles(role) gates out a stale-but-active leadership row whose
        // profile has since been converted away from leader/co_leader — the os7
        // role-guard predicate documents that group_leaders rows don't cascade on
        // a role change, so an ex-leader's grade must not keep feeding the pillar.
        .select(
          "profile_id, group:groups(audience_category, category_id, lifecycle_status), profile:profiles(role)"
        )
        .eq("active", true)
        .in("role", ["leader", "co_leader"])
        .range(0, HEALTH_GRADE_PAGE_LIMIT - 1)
        .returns<LeaderCellJoinRow[]>(),
    ]);

  for (const [label, res] of [
    ["groupRubric", groupRubricRes],
    ["leaderRubric", leaderRubricRes],
    ["group", groupRes],
    ["leader", leaderRes],
    ["leaderCell", leaderCellRes],
  ] as const) {
    if (res.error)
      return {
        data: null,
        error: wrapError(`fetchCellHealthGrades/${label}`, res.error),
      };
  }

  const groupRubric: Rubric = {
    criteria: decodeRubricCriteria(groupRubricRes.data?.criteria ?? null),
  };
  const leaderRubric: Rubric = {
    criteria: decodeRubricCriteria(leaderRubricRes.data?.criteria ?? null),
  };

  // A leader's set of active, non-closed, categorised CELL keys. A closed group's
  // group_leaders rows can stay active (Care code relies on that), so closed
  // groups are excluded — matching the closed-group drop on the group side. A
  // group with no category belongs to no cell and is skipped.
  const leaderCellsByProfile = new Map<string, Set<string>>();
  for (const row of leaderCellRes.data ?? []) {
    if (row.group?.lifecycle_status === "closed") continue;
    // The profile must still BE a leader/co_leader — a stale active group_leaders
    // row left behind by a role change does not count (matches os7's predicate,
    // which gates on the profile's current role, not just the group_leaders row).
    const profileRole = row.profile?.role ?? null;
    if (profileRole !== "leader" && profileRole !== "co_leader") continue;
    const type = row.group?.audience_category ?? null;
    const categoryId = row.group?.category_id ?? null;
    if (!isAudienceCategory(type) || categoryId == null) continue;
    const set = leaderCellsByProfile.get(row.profile_id) ?? new Set();
    set.add(cellKey({ audience: type, categoryId }));
    leaderCellsByProfile.set(row.profile_id, set);
  }

  const groupGrades: ResolvedCellGroupGrade[] = (groupRes.data ?? []).map(
    (row) => ({
      type: row.group?.audience_category ?? null,
      categoryId: row.group?.category_id ?? null,
      isClosed: row.group?.lifecycle_status === "closed",
      letter: resolveGroupRubricGrade({
        rubric: groupRubric,
        scores: decodeNumericRecord(row.criterion_scores),
        override: rowGradeOverride(row, periodMonthIso),
        periodMonth: periodMonthIso,
      }).effective_letter,
    })
  );

  const leaderGrades: ResolvedCellLeaderGrade[] = (leaderRes.data ?? []).map(
    (row) => ({
      cells: leaderCellsByProfile.get(row.profile_id) ?? new Set(),
      letter: resolveLeaderGrade({
        rubric: leaderRubric,
        scores: decodeNumericRecord(row.criterion_scores),
        override: rowGradeOverride(row, periodMonthIso),
        ministryYear,
        currentPeriodMonth: periodMonthIso,
      }).letter,
    })
  );

  return {
    data: tallyCellHealthGrades(groupGrades, leaderGrades),
    error: null,
  };
}
