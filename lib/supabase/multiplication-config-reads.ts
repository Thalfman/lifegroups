import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import { fetchHealthRubric } from "./health-rubric-reads";
import {
  tallyInterestVolumeByType,
  type InterestProspectRow,
  type InterestVolumeByType,
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

// Multiplication Pillars config + funnel-volume read model (#380). Two reads feed
// the Multiply boards:
//   1. fetchMultiplicationConfigs — the per-(type, ministry-year) config rows
//      (thresholds + trigger + fed capacity), column-allowlisted. RLS already
//      restricts SELECT to admins (belt-and-braces, matching the health-rubric
//      reads idiom).
//   2. fetchFunnelVolumeByType — the interest VOLUME per top type, rewired in
//      #399 to the per-cell desired-cell tally: interested-state, non-archived
//      prospects whose DESIRED top type (named at intake) is that type.
//
// The config row's three jsonb columns are decoded into typed config at the trust
// boundary (lib/admin/multiplication-pillars.ts); the row type here stays raw.

export const MULTIPLICATION_CONFIG_COLUMNS =
  "id, group_type, ministry_year, thresholds, trigger_rubric, fed_capacity, updated_at";

// One persisted config row, as read through the allowlist. The three jsonb fields
// are raw; the caller decodes them with decodePillarThresholds / etc.
export type MultiplicationConfigRow = {
  id: string;
  group_type: GroupAudienceCategory;
  ministry_year: number;
  thresholds: unknown;
  trigger_rubric: unknown;
  fed_capacity: unknown;
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
// Interest volume per top type — the per-cell desired-cell tally (#399).
// ---------------------------------------------------------------------------
//
// REWIRED in #399 (ADR 0016): interest is no longer the count of active
// prospects ATTACHED to a group of each type. It is the per-cell desired-cell
// headcount, rolled up to the per-type number the Interest pillar takes: the
// count of prospects in state `interested` (NOT matched/joined/not_at_this_time)
// and not archived whose DESIRED top type (named at intake) is each type. A
// prospect who named no desired cell — or who has moved past raw interest —
// contributes nothing. The state-filtering + keying live in the pure
// lib/admin/prospect-interest core; this read just supplies it bare rows.

// Per-type interest volume, kept under the FunnelVolumeByType name the Multiply
// loader already imports so the rewire is internal. Equals InterestVolumeByType.
export type FunnelVolumeByType = InterestVolumeByType;

export const EMPTY_FUNNEL_VOLUME: FunnelVolumeByType = {
  men: 0,
  women: 0,
  mixed: 0,
};

// The desired-cell + state/archived columns the tally needs. Allowlisted —
// never select("*"); RLS already restricts SELECT to admins (belt-and-braces).
const INTEREST_VOLUME_COLUMNS =
  "state, archived, desired_audience_category, desired_category_id";
const INTEREST_PAGE_LIMIT = 10000;

// Per-type interest volume from the prospects' desired cells. Filters archived
// rows in the DB before the page cap (so a church with >INTEREST_PAGE_LIMIT
// historical prospects can't push interested ones off the first page and
// understate the pillar), then tallies purely. Only interested-state prospects
// with a fully-named desired cell count (enforced in tallyInterestVolumeByType).
export async function fetchFunnelVolumeByType(
  client: ReadClient
): Promise<ReadResult<FunnelVolumeByType>> {
  const { data, error } = await client
    .from("prospects")
    .select(INTEREST_VOLUME_COLUMNS)
    .eq("archived", false)
    .eq("state", "interested")
    .range(0, INTEREST_PAGE_LIMIT - 1)
    .returns<InterestProspectRow[]>();

  if (error)
    return { data: null, error: wrapError("fetchFunnelVolumeByType", error) };

  return { data: tallyInterestVolumeByType(data ?? []), error: null };
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
