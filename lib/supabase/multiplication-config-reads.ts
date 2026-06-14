import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import { countActiveMembersByGroup } from "@/lib/admin/group-capacity-inputs";
import { isAudienceCategory } from "@/lib/admin/audience";
import { cellKey, cellKeyOf } from "@/lib/admin/cell-coordinate";
import { fetchHealthRubric } from "./health-rubric-reads";
import {
  tallyCellInterest,
  type CellInterestTally,
  type InterestProspectRow,
} from "@/lib/admin/prospect-interest";
import {
  resolveGrade,
  type GradeOverrideScope,
} from "@/lib/admin/group-health-override";
import {
  computeGrade,
  decodeRubricCriteria,
  type Rubric,
  type RubricScores,
} from "@/lib/admin/health-rubric";

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
export const MULTIPLICATION_CONFIG_COLUMNS =
  "id, group_type, ministry_year, thresholds, trigger_rubric, updated_at";

// One persisted config row, as read through the allowlist. The two jsonb fields
// are raw; the caller decodes them with decodePillarThresholds / etc.
export type MultiplicationConfigRow = {
  id: string;
  group_type: GroupAudienceCategory;
  ministry_year: number;
  thresholds: unknown;
  trigger_rubric: unknown;
  updated_at: string;
};

// Fetch all config rows for a ministry year (one per group type at most). An
// empty result is the success-with-empty case — a fresh ministry has no config
// until Julian sets it; the board falls back to built-in thresholds.
export async function fetchMultiplicationConfigs(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<MultiplicationConfigRow[]>> {
  const { data, error } = await client
    .from("multiplication_config")
    .select(MULTIPLICATION_CONFIG_COLUMNS)
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
const INTEREST_VOLUME_COLUMNS =
  "state, archived, desired_audience_category, desired_category_id";
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
    .select(INTEREST_VOLUME_COLUMNS)
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

const CELL_GROUP_COLUMNS =
  "id, audience_category, category_id, lifecycle_status";
const CELL_MEMBERSHIP_COLUMNS = "group_id, status";
const ACTIVE_CELL_COLUMNS = "audience_category, category_id";

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
// (cellKeyString → cellKey) so callers index without juggling tuples. Each value
// is the array of ACTIVE member counts of the active groups in that cell.
export type CellActiveGroupSizes = {
  // Stable key → the cell's active group sizes.
  byCell: Map<string, number[]>;
  // The same key → its decomposed parts, for callers that need the audience/cat.
  keys: Map<string, CellKey>;
};

// The stable cell key string — a typed alias over the canonical lenient keyer
// (`cellKeyOf`): a null category collapses to an empty-part key, and an
// uncategorized group is in no cell, so that key is never matched. The encoding
// itself lives in `lib/admin/cell-coordinate.ts`; this narrows the signature to a
// known Audience for the surface and tests that import it.
export function cellKeyString(
  audience: GroupAudienceCategory,
  categoryId: string | null
): string {
  return cellKeyOf(audience, categoryId);
}

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
    const key = cellKeyString(audience, cell.categoryId);
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
    const key = cellKeyString(audience, g.category_id);
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
        .select(CELL_GROUP_COLUMNS)
        .eq("lifecycle_status", "active")
        .range(from, to)
        .returns<CellGroupRow[]>()
    ),
    fetchAllPages<CellMembershipRow>((from, to) =>
      client
        .from("group_memberships")
        .select(CELL_MEMBERSHIP_COLUMNS)
        .eq("status", "active")
        .range(from, to)
        .returns<CellMembershipRow[]>()
    ),
    fetchAllPages<ActiveCellRow>((from, to) =>
      client
        .from("category_type_targets")
        .select(ACTIVE_CELL_COLUMNS)
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

// Decode raw jsonb criterion_scores into clean numeric scores at the trust
// boundary, dropping any non-numeric value (mirrors the Care grade readers).
function decodeScores(raw: unknown): RubricScores {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

// Resolve a grade row to its effective A–F letter for the period (exported for
// testing): roll the stored scores up against the current rubric via the shared
// engine, then apply any active override under its scope (the this-month expiry
// pivots on the override's own stored month, never the current period). Null when
// nothing is scored and no override is active.
export function effectiveGradeLetter(
  rubric: Rubric,
  scores: RubricScores,
  override: Pick<
    GradeScoreFields,
    "override_letter" | "override_scope" | "override_period_month"
  >,
  periodMonthIso: string
): GroupHealthLetter | null {
  const computed = computeGrade(rubric, scores);
  const activeOverride =
    override.override_letter && override.override_scope
      ? {
          letter: override.override_letter,
          scope: override.override_scope,
          period_month: override.override_period_month ?? periodMonthIso,
        }
      : null;
  return resolveGrade(computed.letter, activeOverride, periodMonthIso)
    .effective_letter;
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

const GRADE_SCORE_COLUMNS =
  "criterion_scores, override_letter, override_scope, override_period_month";

// Page cap for the rollup reads, mirroring the interest read. A ministry year with
// more grade rows than this would otherwise be silently truncated by PostgREST's
// default page size and grade the pillar on a partial set.
const HEALTH_GRADE_PAGE_LIMIT = 10000;

// A grade already resolved to its effective letter, ready for per-cell bucketing.
type ResolvedCellGroupGrade = {
  type: GroupAudienceCategory | null;
  categoryId: string | null;
  isClosed: boolean;
  letter: GroupHealthLetter | null;
};
type ResolvedCellLeaderGrade = {
  // Every cell key (type:categoryId) of an active, non-closed, categorised group
  // this leader leads.
  cells: ReadonlySet<string>;
  letter: GroupHealthLetter | null;
};

// The per-CELL effective A–F letter arrays feeding the two health pillars, keyed
// by `${audience_category}:${category_id}` (single colon — matching the readiness
// + interest cell keys, distinct from the capacity read's double-colon key). A
// cell with no grades is simply absent from the map.
export type CellHealthGrades = Map<
  string,
  { groupGrades: GroupHealthLetter[]; leaderGrades: GroupHealthLetter[] }
>;

export const EMPTY_CELL_HEALTH_GRADES: CellHealthGrades = new Map();

function isCategory(value: unknown): value is GroupAudienceCategory {
  return value === "men" || value === "women" || value === "mixed";
}

// The per-cell health key — the same single-colon shape the readiness inputs use.
export function cellHealthKey(
  type: GroupAudienceCategory,
  categoryId: string
): string {
  return cellKey({ audience: type, categoryId });
}

// Pure bucketer (exported for testing): bucket each resolved group grade under its
// CELL (dropping closed groups, ungraded rows, and rows with no type/category) and
// each resolved leader grade under EVERY cell that leader actively leads, so a
// leader spanning more than one cell feeds each cell's Leader Health pillar.
export function tallyCellHealthGrades(
  groupGrades: ResolvedCellGroupGrade[],
  leaderGrades: ResolvedCellLeaderGrade[]
): CellHealthGrades {
  const out: CellHealthGrades = new Map();
  const ensure = (key: string) => {
    let entry = out.get(key);
    if (!entry) {
      entry = { groupGrades: [], leaderGrades: [] };
      out.set(key, entry);
    }
    return entry;
  };

  for (const g of groupGrades) {
    if (!g.letter || g.isClosed) continue;
    if (!isCategory(g.type) || g.categoryId == null) continue;
    ensure(cellHealthKey(g.type, g.categoryId)).groupGrades.push(g.letter);
  }

  for (const l of leaderGrades) {
    if (!l.letter) continue;
    for (const key of l.cells) ensure(key).leaderGrades.push(l.letter);
  }

  return out;
}

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
          `${GRADE_SCORE_COLUMNS}, group:groups(audience_category, category_id, lifecycle_status)`
        )
        .eq("ministry_year", ministryYear)
        .range(0, HEALTH_GRADE_PAGE_LIMIT - 1)
        .returns<GroupGradeJoinRow[]>(),
      client
        .from("leader_rubric_grades")
        .select(`profile_id, ${GRADE_SCORE_COLUMNS}`)
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
    if (!isCategory(type) || categoryId == null) continue;
    const set = leaderCellsByProfile.get(row.profile_id) ?? new Set();
    set.add(cellHealthKey(type, categoryId));
    leaderCellsByProfile.set(row.profile_id, set);
  }

  const groupGrades: ResolvedCellGroupGrade[] = (groupRes.data ?? []).map(
    (row) => ({
      type: row.group?.audience_category ?? null,
      categoryId: row.group?.category_id ?? null,
      isClosed: row.group?.lifecycle_status === "closed",
      letter: effectiveGradeLetter(
        groupRubric,
        decodeScores(row.criterion_scores),
        row,
        periodMonthIso
      ),
    })
  );

  const leaderGrades: ResolvedCellLeaderGrade[] = (leaderRes.data ?? []).map(
    (row) => ({
      cells: leaderCellsByProfile.get(row.profile_id) ?? new Set(),
      letter: effectiveGradeLetter(
        leaderRubric,
        decodeScores(row.criterion_scores),
        row,
        periodMonthIso
      ),
    })
  );

  return {
    data: tallyCellHealthGrades(groupGrades, leaderGrades),
    error: null,
  };
}
