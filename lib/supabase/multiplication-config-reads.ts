import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import {
  resolveGrade,
  type GradeOverrideScope,
} from "@/lib/admin/group-health-override";

// Multiplication Pillars config + funnel-volume read model (#380). Two reads feed
// the Multiply boards:
//   1. fetchMultiplicationConfigs — the per-(type, ministry-year) config rows
//      (thresholds + trigger + fed capacity), column-allowlisted. RLS already
//      restricts SELECT to admins (belt-and-braces, matching the health-rubric
//      reads idiom).
//   2. fetchFunnelVolumeByType — the Interest Funnel VOLUME per group type,
//      derived from active prospects whose matched/joined group is of that type.
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
// Group/Leader Health grade roll-up per group type (#377/#378 → #380).
// ---------------------------------------------------------------------------
//
// The Multiply boards' Group Health and Leader Health pillars roll up that type's
// rubric grades over the Ministry Year. We read the persisted grades (#377/#378),
// resolve each to its EFFECTIVE letter (applying the this-month/until-cleared
// override expiry via the shared resolver — never the possibly-stale stored
// computed letter alone), bucket them by group type, and hand the A–F arrays to
// the pure pillar resolver. A type with no grades yet yields an empty array, so
// computePillars renders that pillar "—".

// The override-resolution slice of a grade row, shared by both grade tables.
type GradeOverrideFields = {
  computed_letter: GroupHealthLetter | null;
  override_letter: GroupHealthLetter | null;
  override_scope: GradeOverrideScope | null;
  override_period_month: string | null;
};

// Resolve a grade row to its effective A–F letter for the period, or null when
// nothing is graded (no computed letter and no active override).
function effectiveGradeLetter(
  row: GradeOverrideFields,
  periodMonthIso: string
): GroupHealthLetter | null {
  const override =
    row.override_letter && row.override_scope
      ? {
          letter: row.override_letter,
          scope: row.override_scope,
          period_month: row.override_period_month ?? periodMonthIso,
        }
      : null;
  return resolveGrade(row.computed_letter, override, periodMonthIso)
    .effective_letter;
}

type GroupGradeJoinRow = GradeOverrideFields & {
  group: {
    audience_category: GroupAudienceCategory | null;
    lifecycle_status: string | null;
  } | null;
};

type LeaderGradeRow = GradeOverrideFields & { profile_id: string };

type LeaderTypeJoinRow = {
  profile_id: string;
  group: { audience_category: GroupAudienceCategory | null } | null;
};

const GRADE_OVERRIDE_COLUMNS =
  "computed_letter, override_letter, override_scope, override_period_month";

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

// Pure bucketer (exported for testing): drop the closed groups and the ungraded
// rows, resolve each surviving row to its effective letter, and bucket group
// grades by their group's type and leader grades by the type of the group the
// leader actively leads. Leaders not actively leading a categorised group, and
// grades on closed/uncategorised groups, contribute to no type.
export function tallyHealthGrades(
  groupRows: GroupGradeJoinRow[],
  leaderRows: LeaderGradeRow[],
  leaderTypeByProfile: ReadonlyMap<string, GroupAudienceCategory>,
  periodMonthIso: string
): HealthGradesByType {
  const out: HealthGradesByType = {
    men: { groupGrades: [], leaderGrades: [] },
    women: { groupGrades: [], leaderGrades: [] },
    mixed: { groupGrades: [], leaderGrades: [] },
  };

  for (const row of groupRows) {
    const type = row.group?.audience_category ?? null;
    if (type !== "men" && type !== "women" && type !== "mixed") continue;
    // A closed group is no longer part of the type's live multiplication picture.
    if (row.group?.lifecycle_status === "closed") continue;
    const letter = effectiveGradeLetter(row, periodMonthIso);
    if (letter) out[type].groupGrades.push(letter);
  }

  for (const row of leaderRows) {
    const type = leaderTypeByProfile.get(row.profile_id);
    if (!type) continue;
    const letter = effectiveGradeLetter(row, periodMonthIso);
    if (letter) out[type].leaderGrades.push(letter);
  }

  return out;
}

// Read + resolve the per-type Group/Leader Health grade arrays for a ministry
// year. Three scoped reads (group grades + their group's type, leader grades,
// and the active leader→type map), then a pure bucket. A read failure surfaces
// as an error so the board can note it rather than silently grade on partial data.
export async function fetchHealthGradesByType(
  client: ReadClient,
  ministryYear: number,
  periodMonthIso: string
): Promise<ReadResult<HealthGradesByType>> {
  const [groupRes, leaderRes, leaderTypeRes] = await Promise.all([
    client
      .from("group_rubric_grades")
      .select(
        `${GRADE_OVERRIDE_COLUMNS}, group:groups(audience_category, lifecycle_status)`
      )
      .eq("ministry_year", ministryYear)
      .returns<GroupGradeJoinRow[]>(),
    client
      .from("leader_rubric_grades")
      .select(`profile_id, ${GRADE_OVERRIDE_COLUMNS}`)
      .eq("ministry_year", ministryYear)
      .returns<LeaderGradeRow[]>(),
    client
      .from("group_leaders")
      .select("profile_id, group:groups(audience_category)")
      .eq("active", true)
      .in("role", ["leader", "co_leader"])
      .returns<LeaderTypeJoinRow[]>(),
  ]);

  if (groupRes.error)
    return {
      data: null,
      error: wrapError("fetchHealthGradesByType/group", groupRes.error),
    };
  if (leaderRes.error)
    return {
      data: null,
      error: wrapError("fetchHealthGradesByType/leader", leaderRes.error),
    };
  if (leaderTypeRes.error)
    return {
      data: null,
      error: wrapError("fetchHealthGradesByType/leaderType", leaderTypeRes.error),
    };

  const leaderTypeByProfile = new Map<string, GroupAudienceCategory>();
  for (const row of leaderTypeRes.data ?? []) {
    const type = row.group?.audience_category ?? null;
    if (type === "men" || type === "women" || type === "mixed") {
      // First active categorised leadership wins (a leader of one type).
      if (!leaderTypeByProfile.has(row.profile_id)) {
        leaderTypeByProfile.set(row.profile_id, type);
      }
    }
  }

  return {
    data: tallyHealthGrades(
      groupRes.data ?? [],
      leaderRes.data ?? [],
      leaderTypeByProfile,
      periodMonthIso
    ),
    error: null,
  };
}
