import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import { fetchHealthRubric } from "./health-rubric-reads";
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

// Multiplication Pillars config + funnel-volume read model (#380, updated #401).
// Reads that feed the Multiply boards:
//   1. fetchMultiplicationConfigs — the per-(type, ministry-year) config rows
//      (thresholds + trigger), column-allowlisted. RLS already restricts SELECT
//      to admins (belt-and-braces, matching the health-rubric reads idiom). The
//      fed-capacity column was retired in #401 — capacity is now derived.
//   2. fetchFunnelVolumeByType — the Interest Funnel VOLUME per group type,
//      derived from active prospects whose matched/joined group is of that type.
//   3. fetchCellActiveGroupSizes — per-CELL active group member counts (#401),
//      the input to the derived per-cell capacity ISSUE resolver.
//
// The config row's two jsonb columns are decoded into typed config at the trust
// boundary (lib/admin/multiplication-pillars.ts); the row type here stays raw.

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
// Interest Funnel volume per group type.
// ---------------------------------------------------------------------------

// The funnel-volume read joins active (non-archived) prospects to their attached
// group's audience_category. A prospect with no group, or a group with no
// category, contributes to no type's volume (it isn't yet a type-specific signal).
type FunnelVolumeJoinRow = {
  id: string;
  archived: boolean;
  group: { audience_category: GroupAudienceCategory | null } | null;
};

const FUNNEL_VOLUME_COLUMNS = "id, archived, group:groups(audience_category)";
const FUNNEL_PAGE_LIMIT = 10000;

// Per-type Interest Funnel volume: the count of active prospects whose attached
// group is of each type. Drives the Interest pillar's input.
export type FunnelVolumeByType = Record<GroupAudienceCategory, number>;

export const EMPTY_FUNNEL_VOLUME: FunnelVolumeByType = {
  men: 0,
  women: 0,
  mixed: 0,
};

// Count active prospects per group type. Reads prospects + their group's audience
// category in one round-trip, then tallies in TS. Archived prospects (joined /
// parked-off-board) are excluded — the funnel volume is the LIVE interest signal.
export async function fetchFunnelVolumeByType(
  client: ReadClient
): Promise<ReadResult<FunnelVolumeByType>> {
  const { data, error } = await client
    .from("prospects")
    .select(FUNNEL_VOLUME_COLUMNS)
    // Filter archived (joined / parked-off-board) rows in the DB BEFORE the page
    // cap, so a church with >FUNNEL_PAGE_LIMIT historical prospects can't push
    // active ones off the first page and understate the Interest pillar.
    .eq("archived", false)
    .range(0, FUNNEL_PAGE_LIMIT - 1)
    .returns<FunnelVolumeJoinRow[]>();

  if (error)
    return { data: null, error: wrapError("fetchFunnelVolumeByType", error) };

  return { data: tallyFunnelVolume(data ?? []), error: null };
}

// Pure tally (exported for testing): count non-archived prospects per type.
export function tallyFunnelVolume(
  rows: FunnelVolumeJoinRow[]
): FunnelVolumeByType {
  const out: FunnelVolumeByType = { men: 0, women: 0, mixed: 0 };
  for (const row of rows) {
    if (row.archived) continue;
    const type = row.group?.audience_category ?? null;
    if (type === "men" || type === "women" || type === "mixed") {
      out[type] += 1;
    }
  }
  return out;
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
// `groups.category_id` (the group → cell FK) is being added by the parallel cell
// model slice (#400). Until it lands, a group's category_id reads as null and so
// belongs to no category cell — its sizes are bucketed under a `null` category
// key, which the type-level rollup still folds in. The read stays column-
// allowlisted (reads seam, ADR 0015): we project exactly the cell-keying columns
// + the per-group active membership, never select("*").
//
// We read groups + group_memberships and aggregate PURELY (the count idiom mirrors
// lib/admin/capacity-board.ts `buildCapacityBoardModel`: a group's member count is
// its number of group_memberships rows with status='active').

// One active-group row for the cell read: its id + the two cell-keying columns.
// `category_id` is allowlisted ahead of the #400 column landing; a missing/null
// value means the group is in no category cell.
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

const CELL_GROUP_COLUMNS =
  "id, audience_category, category_id, lifecycle_status";
const CELL_MEMBERSHIP_COLUMNS = "group_id, status";
const CELL_PAGE_LIMIT = 10000;

// A cell key: audience type + category id (null when the group has no category).
export type CellKey = {
  audience: GroupAudienceCategory;
  categoryId: string | null;
};

// The per-cell active group sizes: keyed by a stable `${audience}::${categoryId}`
// string so callers can index without juggling tuples. Each value is the array of
// ACTIVE member counts of the active groups in that cell.
export type CellActiveGroupSizes = {
  // Stable key → the cell's active group sizes.
  byCell: Map<string, number[]>;
  // The same key → its decomposed parts, for callers that need the audience/cat.
  keys: Map<string, CellKey>;
};

// Build the stable cell key string. Exported so the surface and tests agree.
export function cellKeyString(
  audience: GroupAudienceCategory,
  categoryId: string | null
): string {
  return `${audience}::${categoryId ?? ""}`;
}

// Pure aggregator (exported for testing): bucket each ACTIVE group's active member
// count under its cell. Only active groups with a real audience category form a
// cell; a group's size is its count of active memberships (0 when it has none).
export function tallyCellActiveGroupSizes(
  groups: readonly CellGroupRow[],
  memberships: readonly CellMembershipRow[]
): CellActiveGroupSizes {
  // Active-membership count per group id (the capacity-board count idiom).
  const activeCountByGroup = new Map<string, number>();
  for (const m of memberships) {
    if (m.status !== "active") continue;
    activeCountByGroup.set(
      m.group_id,
      (activeCountByGroup.get(m.group_id) ?? 0) + 1
    );
  }

  const byCell = new Map<string, number[]>();
  const keys = new Map<string, CellKey>();
  for (const g of groups) {
    if (g.lifecycle_status !== "active") continue;
    const audience = g.audience_category;
    if (audience !== "men" && audience !== "women" && audience !== "mixed") {
      continue;
    }
    const categoryId = g.category_id ?? null;
    const key = cellKeyString(audience, categoryId);
    const size = activeCountByGroup.get(g.id) ?? 0;
    const list = byCell.get(key);
    if (list) {
      list.push(size);
    } else {
      byCell.set(key, [size]);
      keys.set(key, { audience, categoryId });
    }
  }

  return { byCell, keys };
}

export const EMPTY_CELL_ACTIVE_GROUP_SIZES: CellActiveGroupSizes = {
  byCell: new Map(),
  keys: new Map(),
};

// Read the per-cell active group sizes: active groups (id + cell-keying columns)
// and their active memberships, then aggregate purely. A read failure surfaces as
// an error so the board notes it rather than grading capacity on partial data.
export async function fetchCellActiveGroupSizes(
  client: ReadClient
): Promise<ReadResult<CellActiveGroupSizes>> {
  const [groupsRes, membershipsRes] = await Promise.all([
    client
      .from("groups")
      .select(CELL_GROUP_COLUMNS)
      .eq("lifecycle_status", "active")
      .range(0, CELL_PAGE_LIMIT - 1)
      .returns<CellGroupRow[]>(),
    client
      .from("group_memberships")
      .select(CELL_MEMBERSHIP_COLUMNS)
      .eq("status", "active")
      .range(0, CELL_PAGE_LIMIT - 1)
      .returns<CellMembershipRow[]>(),
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

  return {
    data: tallyCellActiveGroupSizes(
      groupsRes.data ?? [],
      membershipsRes.data ?? []
    ),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Group/Leader Health grade roll-up per group type (#377/#378 → #380).
// ---------------------------------------------------------------------------
//
// The Multiply boards' Group Health and Leader Health pillars roll up that type's
// rubric grades over the Ministry Year. We RECOMPUTE each grade's effective letter
// live from its stored criterion_scores against the CURRENT rubric — never the
// possibly-stale persisted computed_letter — exactly as the Care detail readers
// do, so the board and the grade editor always agree even after a rubric edit.
// The shared override resolver then applies the this-month/until-cleared expiry.
// Grades bucket by group type; a leader spanning more than one type contributes
// to every type they actively lead. A type with no grades yields an empty array,
// so computePillars renders that pillar "—".

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
    lifecycle_status: string | null;
  } | null;
};

type LeaderGradeRow = GradeScoreFields & { profile_id: string };

type LeaderTypeJoinRow = {
  profile_id: string;
  group: {
    audience_category: GroupAudienceCategory | null;
    lifecycle_status: string | null;
  } | null;
  profile: { role: string | null } | null;
};

const GRADE_SCORE_COLUMNS =
  "criterion_scores, override_letter, override_scope, override_period_month";

// Page cap for the rollup reads, mirroring the funnel read. A ministry year with
// more grade rows than this would otherwise be silently truncated by PostgREST's
// default page size and grade the pillar on a partial set.
const HEALTH_GRADE_PAGE_LIMIT = 10000;

// A grade already resolved to its effective letter, ready for bucketing.
type ResolvedGroupGrade = {
  type: GroupAudienceCategory | null;
  isClosed: boolean;
  letter: GroupHealthLetter | null;
};
type ResolvedLeaderGrade = {
  // Every active, non-closed, categorised group this leader leads.
  types: ReadonlySet<GroupAudienceCategory>;
  letter: GroupHealthLetter | null;
};

// The per-type effective A–F letter arrays feeding the two health pillars.
export type HealthGradesByType = Record<
  GroupAudienceCategory,
  { groupGrades: GroupHealthLetter[]; leaderGrades: GroupHealthLetter[] }
>;

export const EMPTY_HEALTH_GRADES: HealthGradesByType = {
  men: { groupGrades: [], leaderGrades: [] },
  women: { groupGrades: [], leaderGrades: [] },
  mixed: { groupGrades: [], leaderGrades: [] },
};

function isCategory(value: unknown): value is GroupAudienceCategory {
  return value === "men" || value === "women" || value === "mixed";
}

// Pure bucketer (exported for testing): bucket each resolved group grade under
// its type (dropping closed groups and ungraded rows) and each resolved leader
// grade under EVERY type that leader actively leads, so a multi-type leader feeds
// each of their boards' Leader Health pillar.
export function tallyHealthGrades(
  groupGrades: ResolvedGroupGrade[],
  leaderGrades: ResolvedLeaderGrade[]
): HealthGradesByType {
  const out: HealthGradesByType = {
    men: { groupGrades: [], leaderGrades: [] },
    women: { groupGrades: [], leaderGrades: [] },
    mixed: { groupGrades: [], leaderGrades: [] },
  };

  for (const g of groupGrades) {
    if (!g.letter || g.isClosed || !isCategory(g.type)) continue;
    out[g.type].groupGrades.push(g.letter);
  }

  for (const l of leaderGrades) {
    if (!l.letter) continue;
    for (const type of l.types) out[type].leaderGrades.push(l.letter);
  }

  return out;
}

// Read + resolve the per-type Group/Leader Health grade arrays for a ministry
// year. Reads both rubrics (to recompute live), the two grade tables' scores +
// overrides, and the active leader→type map, then resolves + buckets purely. A
// read failure surfaces as an error so the board notes it rather than silently
// grading on partial data.
export async function fetchHealthGradesByType(
  client: ReadClient,
  ministryYear: number,
  periodMonthIso: string
): Promise<ReadResult<HealthGradesByType>> {
  const [groupRubricRes, leaderRubricRes, groupRes, leaderRes, leaderTypeRes] =
    await Promise.all([
      fetchHealthRubric(client, "group"),
      fetchHealthRubric(client, "leader"),
      client
        .from("group_rubric_grades")
        .select(
          `${GRADE_SCORE_COLUMNS}, group:groups(audience_category, lifecycle_status)`
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
          "profile_id, group:groups(audience_category, lifecycle_status), profile:profiles(role)"
        )
        .eq("active", true)
        .in("role", ["leader", "co_leader"])
        .range(0, HEALTH_GRADE_PAGE_LIMIT - 1)
        .returns<LeaderTypeJoinRow[]>(),
    ]);

  for (const [label, res] of [
    ["groupRubric", groupRubricRes],
    ["leaderRubric", leaderRubricRes],
    ["group", groupRes],
    ["leader", leaderRes],
    ["leaderType", leaderTypeRes],
  ] as const) {
    if (res.error)
      return {
        data: null,
        error: wrapError(`fetchHealthGradesByType/${label}`, res.error),
      };
  }

  const groupRubric: Rubric = {
    criteria: decodeRubricCriteria(groupRubricRes.data?.criteria ?? null),
  };
  const leaderRubric: Rubric = {
    criteria: decodeRubricCriteria(leaderRubricRes.data?.criteria ?? null),
  };

  // A leader's set of active, non-closed, categorised types. A closed group's
  // group_leaders rows can stay active (Care code relies on that), so closed
  // groups are excluded — matching the closed-group drop on the group side.
  const leaderTypesByProfile = new Map<string, Set<GroupAudienceCategory>>();
  for (const row of leaderTypeRes.data ?? []) {
    if (row.group?.lifecycle_status === "closed") continue;
    // The profile must still BE a leader/co_leader — a stale active group_leaders
    // row left behind by a role change does not count (matches os7's predicate,
    // which gates on the profile's current role, not just the group_leaders row).
    const profileRole = row.profile?.role ?? null;
    if (profileRole !== "leader" && profileRole !== "co_leader") continue;
    const type = row.group?.audience_category ?? null;
    if (!isCategory(type)) continue;
    const set = leaderTypesByProfile.get(row.profile_id) ?? new Set();
    set.add(type);
    leaderTypesByProfile.set(row.profile_id, set);
  }

  const groupGrades: ResolvedGroupGrade[] = (groupRes.data ?? []).map(
    (row) => ({
      type: row.group?.audience_category ?? null,
      isClosed: row.group?.lifecycle_status === "closed",
      letter: effectiveGradeLetter(
        groupRubric,
        decodeScores(row.criterion_scores),
        row,
        periodMonthIso
      ),
    })
  );

  const leaderGrades: ResolvedLeaderGrade[] = (leaderRes.data ?? []).map(
    (row) => ({
      types: leaderTypesByProfile.get(row.profile_id) ?? new Set(),
      letter: effectiveGradeLetter(
        leaderRubric,
        decodeScores(row.criterion_scores),
        row,
        periodMonthIso
      ),
    })
  );

  return { data: tallyHealthGrades(groupGrades, leaderGrades), error: null };
}
