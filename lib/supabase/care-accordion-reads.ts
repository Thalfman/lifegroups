import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { GroupHealthLetter, LeaderHealthLetter } from "@/types/enums";
import {
  columns,
  wrapError,
  decodeNumericRecord,
  type ReadResult,
} from "@/lib/supabase/read-core";
import {
  fetchHealthRubric,
  type PersistedGroupGrade,
  type PersistedLeaderGrade,
} from "@/lib/supabase/rubric-grade-reads";
import { fetchLeaderHealthRubric } from "@/lib/admin/leader-health-read";
import { decodeRubricCriteria, type Rubric } from "@/lib/admin/health-rubric";
import {
  buildNoteStateByLeaderId,
  resolveGroupHealthByGroupId,
  resolveLeaderHealthByLeaderId,
  type CareAccordionNoteState,
  type CareGradeEntryBundle,
  type GroupHealthGradeInput,
  type LeaderHealthGradeInput,
} from "@/lib/admin/care-accordion";

// Read side for the Care accordion enrichment (#377/#378/#381). Batches the
// Group-/Leader-Health Grades and the Care Notes / Prayer Requests presence the
// per-leader panel renders, so the accordion fills its (formerly placeholder)
// slots in a fixed handful of admin-only reads — never one read per leader.
//
// Admin-only data; these run behind the admin layout guard and the tables'
// admin-only RLS. The grade tables are in the typed schema (types/database.ts ›
// group_rubric_grades / leader_rubric_grades), so the selects are fully typed —
// no `as never` casts. The note/prayer/grant reads go through the typed client
// and return only what the caller's RLS admits (sealed Leaders contribute
// nothing).

// The year readers select a deliberately narrower slice of the raw grade
// shapes than the single-row readers (rubric-grade-reads.ts) — just what the
// letter resolvers need — so they pin their own allowlists rather than
// widening the read to reuse the 8-column ones.
type LeaderGradeYearRow = Pick<
  PersistedLeaderGrade,
  | "profile_id"
  | "criterion_scores"
  | "override_letter"
  | "override_scope"
  | "override_period_month"
>;

export const ADMIN_LEADER_RUBRIC_GRADE_YEAR_COLUMNS =
  columns<LeaderGradeYearRow>()(
    "profile_id",
    "criterion_scores",
    "override_letter",
    "override_scope",
    "override_period_month"
  );

// All persisted Leader-Health Grade rows for a ministry year (one per graded
// leader), reduced to what the letter resolver needs.
export async function fetchLeaderRubricGradesForYear(
  client: AppSupabaseClient,
  ministryYear: number
): Promise<ReadResult<LeaderHealthGradeInput[]>> {
  const { data, error } = await client
    .from("leader_rubric_grades")
    .select(ADMIN_LEADER_RUBRIC_GRADE_YEAR_COLUMNS.select)
    .eq("ministry_year", ministryYear)
    .returns<LeaderGradeYearRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLeaderRubricGradesForYear", error),
    };
  return {
    data: (data ?? []).map((r) => ({
      profile_id: r.profile_id,
      criterion_scores: decodeNumericRecord(r.criterion_scores),
      override_letter: r.override_letter,
      override_scope: r.override_scope,
      override_period_month: r.override_period_month,
    })),
    error: null,
  };
}

type GroupGradeYearRow = Pick<
  PersistedGroupGrade,
  | "group_id"
  | "criterion_scores"
  | "override_letter"
  | "override_scope"
  | "override_period_month"
>;

export const ADMIN_GROUP_RUBRIC_GRADE_YEAR_COLUMNS =
  columns<GroupGradeYearRow>()(
    "group_id",
    "criterion_scores",
    "override_letter",
    "override_scope",
    "override_period_month"
  );

// All persisted Group-Health Grade rows for a ministry year (one per graded
// group), reduced to what the letter resolver needs.
export async function fetchGroupRubricGradesForYear(
  client: AppSupabaseClient,
  ministryYear: number
): Promise<ReadResult<GroupHealthGradeInput[]>> {
  const { data, error } = await client
    .from("group_rubric_grades")
    .select(ADMIN_GROUP_RUBRIC_GRADE_YEAR_COLUMNS.select)
    .eq("ministry_year", ministryYear)
    .returns<GroupGradeYearRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchGroupRubricGradesForYear", error),
    };
  return {
    data: (data ?? []).map((r) => ({
      group_id: r.group_id,
      criterion_scores: decodeNumericRecord(r.criterion_scores),
      override_letter: r.override_letter,
      override_scope: r.override_scope,
      override_period_month: r.override_period_month,
    })),
    error: null,
  };
}

// subject_profile_id of every Leader whose transparency grant is ON (admin-only
// by RLS). These are the Leaders whose Care Notes / Prayer Requests the admin
// may read; everyone else is sealed.
async function fetchGrantedSubjectIds(
  client: AppSupabaseClient
): Promise<ReadResult<string[]>> {
  const { data, error } = await client
    .from("note_transparency_grants")
    .select("subject_profile_id, granted")
    .eq("granted", true);
  if (error)
    return { data: null, error: wrapError("fetchGrantedSubjectIds", error) };
  const ids = (data ?? [])
    .map((r) => (r as { subject_profile_id: string | null }).subject_profile_id)
    .filter((id): id is string => Boolean(id));
  return { data: ids, error: null };
}

// The subject_profile_id of each profile-scoped row the caller can read from a
// subject-keyed table (`care_notes` / `prayer_requests`). RLS returns rows for
// granted subjects PLUS the caller's own authored rows — since ADR 0023 an
// admin can author, so readable is wider than granted and must not be treated
// as a grant signal. One id per row, so the caller can count per Leader.
// Group-subject rows (subject_profile_id null) are dropped by the Boolean
// filter, so no SQL null-filter is needed.
//
// Known scale debt: this ships one row per readable row just to count in JS.
// Acceptable while note volume is small-church scale; if it grows, replace
// with a count aggregate — but note the counts must stay RLS-scoped (what the
// VIEWER can read), so a SECURITY DEFINER count RPC would have to re-encode
// the grant logic rather than lean on RLS. See docs/ui-followups.md.
async function fetchSubjectProfileIds(
  client: AppSupabaseClient,
  table: "care_notes" | "prayer_requests"
): Promise<ReadResult<string[]>> {
  const { data, error } = await client.from(table).select("subject_profile_id");
  if (error)
    return {
      data: null,
      error: wrapError(`fetchSubjectProfileIds(${table})`, error),
    };
  const ids = (data ?? [])
    .map((r) => (r as { subject_profile_id: string | null }).subject_profile_id)
    .filter((id): id is string => Boolean(id));
  return { data: ids, error: null };
}

export type CareAccordionEnrichment = {
  leaderHealthByLeaderId: Map<string, LeaderHealthLetter | null>;
  groupHealthByGroupId: Map<string, GroupHealthLetter | null>;
  noteStateByLeaderId: Map<string, CareAccordionNoteState>;
  // ADR 0023 — the inline grade editors' inputs (rubric criteria + raw grade
  // rows + availability flags), assembled from the SAME reads as the letter
  // maps above so the accordion gains grade entry with zero extra reads.
  gradeEntry: CareGradeEntryBundle;
  // First error encountered, for an optional surface banner. The maps still
  // come back best-effort (a failed read contributes an empty map / sealed).
  error: string | null;
};

const EMPTY_GRADE_ENTRY: CareGradeEntryBundle = {
  ministryYear: null,
  periodMonthIso: "",
  leaderCriteria: [],
  groupCriteria: [],
  leaderGradeByProfileId: new Map(),
  groupGradeByGroupId: new Map(),
  // No DB ⇒ nothing to overwrite; off-season/no-rubric states render their own
  // explanations, so the read-failure guard stays off.
  leaderGradesAvailable: true,
  groupGradesAvailable: true,
};

const EMPTY_ENRICHMENT: CareAccordionEnrichment = {
  leaderHealthByLeaderId: new Map(),
  groupHealthByGroupId: new Map(),
  noteStateByLeaderId: new Map(),
  gradeEntry: EMPTY_GRADE_ENTRY,
  error: null,
};

// Gather + resolve the accordion enrichment. Grades are only read inside a
// Ministry Year (the Jun/Jul off-season has none, exactly as the per-leader
// grade editors are suppressed then). Every read degrades independently: a
// failed grade read leaves that grade ungraded; a failed note read leaves the
// Leader sealed — the surface never blocks on enrichment.
export async function loadCareAccordionEnrichment(
  client: AppSupabaseClient,
  opts: { ministryYear: number | null; periodMonthIso: string }
): Promise<CareAccordionEnrichment> {
  const { ministryYear, periodMonthIso } = opts;
  const inYear = ministryYear !== null;

  const emptyRubric: ReadResult<Rubric> = {
    data: { criteria: [] },
    error: null,
  };
  const emptyLeaderRows: ReadResult<LeaderHealthGradeInput[]> = {
    data: [],
    error: null,
  };
  const emptyGroupRows: ReadResult<GroupHealthGradeInput[]> = {
    data: [],
    error: null,
  };

  const [
    leaderRubricRes,
    groupRubricRes,
    leaderGradesRes,
    groupGradesRes,
    grantsRes,
    careNoteIdsRes,
    prayerIdsRes,
  ] = await Promise.all([
    inYear ? fetchLeaderHealthRubric(client) : Promise.resolve(emptyRubric),
    inYear
      ? fetchHealthRubric(client, "group")
      : Promise.resolve({ data: null, error: null } as ReadResult<{
          criteria: unknown;
        } | null>),
    inYear && ministryYear !== null
      ? fetchLeaderRubricGradesForYear(client, ministryYear)
      : Promise.resolve(emptyLeaderRows),
    inYear && ministryYear !== null
      ? fetchGroupRubricGradesForYear(client, ministryYear)
      : Promise.resolve(emptyGroupRows),
    fetchGrantedSubjectIds(client),
    fetchSubjectProfileIds(client, "care_notes"),
    fetchSubjectProfileIds(client, "prayer_requests"),
  ]);

  // Leader-Health letters (#378). Resolve only when in a year and both the
  // rubric and grade rows read cleanly; otherwise leave the map empty (ungraded).
  const leaderHealthByLeaderId =
    inYear &&
    ministryYear !== null &&
    !leaderRubricRes.error &&
    !leaderGradesRes.error
      ? resolveLeaderHealthByLeaderId(
          leaderGradesRes.data ?? [],
          leaderRubricRes.data ?? { criteria: [] },
          ministryYear,
          periodMonthIso
        )
      : new Map<string, LeaderHealthLetter | null>();

  // Group-Health letters (#377).
  const groupRubric: Rubric = {
    criteria: decodeRubricCriteria(groupRubricRes.data?.criteria ?? null),
  };
  const groupHealthByGroupId =
    inYear && !groupRubricRes.error && !groupGradesRes.error
      ? resolveGroupHealthByGroupId(
          groupGradesRes.data ?? [],
          groupRubric,
          periodMonthIso
        )
      : new Map<string, GroupHealthLetter | null>();

  // Care Notes / Prayer presence (#381). A failed grant read forces sealed (the
  // safe default) by treating the granted set as empty.
  const noteStateByLeaderId = buildNoteStateByLeaderId({
    grantedSubjectIds: grantsRes.error ? [] : (grantsRes.data ?? []),
    careNoteSubjectIds: careNoteIdsRes.error ? [] : (careNoteIdsRes.data ?? []),
    prayerSubjectIds: prayerIdsRes.error ? [] : (prayerIdsRes.data ?? []),
  });

  // ADR 0023 — the inline editors' bundle, from the rows already fetched
  // above. A failed rubric/grade read marks that domain unavailable so the
  // panel renders the detail page's "reload before editing" guard instead of
  // an editor seeded from data we failed to read.
  const gradeEntry: CareGradeEntryBundle = {
    ministryYear,
    periodMonthIso,
    leaderCriteria: leaderRubricRes.data?.criteria ?? [],
    groupCriteria: groupRubric.criteria,
    leaderGradeByProfileId: new Map(
      (leaderGradesRes.data ?? []).map((r) => [r.profile_id, r])
    ),
    groupGradeByGroupId: new Map(
      (groupGradesRes.data ?? []).map((r) => [r.group_id, r])
    ),
    leaderGradesAvailable: !leaderRubricRes.error && !leaderGradesRes.error,
    groupGradesAvailable: !groupRubricRes.error && !groupGradesRes.error,
  };

  const error =
    leaderRubricRes.error?.message ??
    groupRubricRes.error?.message ??
    leaderGradesRes.error?.message ??
    groupGradesRes.error?.message ??
    grantsRes.error?.message ??
    careNoteIdsRes.error?.message ??
    prayerIdsRes.error?.message ??
    null;

  return {
    leaderHealthByLeaderId,
    groupHealthByGroupId,
    noteStateByLeaderId,
    gradeEntry,
    error,
  };
}

export { EMPTY_ENRICHMENT };
