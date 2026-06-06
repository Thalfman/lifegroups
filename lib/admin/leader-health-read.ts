import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  LeaderHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";
import { wrapError, type ReadResult } from "@/lib/supabase/read-core";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { decodeRubricCriteria, type Rubric } from "@/lib/admin/health-rubric";

// Read side for the Leader-Health Grade (#378 / ADR 0018, pivot slice 5).
// Admin-only data; these run behind the admin layout guard and the tables'
// admin-only RLS. The rubric read reuses the shared health_rubrics reader
// filtered to kind='leader' (no second read path); the grade read pulls the one
// persisted leader_rubric_grades row for a (leader, ministry year).
//
// The current-period helpers (currentPeriodMonthIso / currentMinistryYear) live
// in lib/admin/ministry-year.ts — the one home for the shared period key.

// Fetch the current Leader-Health Rubric (the kind='leader' row), decoded into
// the engine's Rubric shape. A missing row decodes to an empty rubric — a fresh
// ministry has no leader rubric until Julian builds one in Settings. Read
// failures propagate rather than silently grading on an empty rubric.
export async function fetchLeaderHealthRubric(
  client: AppSupabaseClient
): Promise<ReadResult<Rubric>> {
  const res = await fetchHealthRubric(client, "leader");
  if (res.error)
    return {
      data: null,
      error: wrapError("fetchLeaderHealthRubric", res.error),
    };
  return {
    data: { criteria: decodeRubricCriteria(res.data?.criteria ?? null) },
    error: null,
  };
}

// One persisted Leader-Health Grade row, as read through the column allowlist.
export type LeaderRubricGradeRow = {
  profile_id: string;
  ministry_year: number;
  criterion_scores: Record<string, number>;
  computed_letter: LeaderHealthLetter | null;
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

const LEADER_GRADE_COLUMNS =
  "profile_id, ministry_year, criterion_scores, computed_letter, " +
  "override_letter, override_scope, override_period_month, updated_at";

type PersistedLeaderGrade = {
  profile_id: string;
  ministry_year: number;
  criterion_scores: unknown;
  computed_letter: LeaderHealthLetter | null;
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// Decode the raw jsonb criterion_scores into a clean Record<string, number>,
// dropping any non-numeric value (the trust-boundary decode for the read).
function decodeScores(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

// Fetch a leader's persisted Leader-Health Grade for a ministry year, or null
// when none has been entered yet (the success-with-null case, not an error).
// The leader_rubric_grades table is not in the generated supabase schema types,
// so its select is cast here — the same trust seam the group-health reads use.
export async function fetchLeaderRubricGrade(
  client: AppSupabaseClient,
  profileId: string,
  ministryYear: number
): Promise<ReadResult<LeaderRubricGradeRow | null>> {
  const { data, error } = await (client as AppSupabaseClient)
    .from("leader_rubric_grades" as never)
    .select(LEADER_GRADE_COLUMNS as never)
    .eq("profile_id" as never, profileId as never)
    .eq("ministry_year" as never, ministryYear as never)
    .maybeSingle<PersistedLeaderGrade>();

  if (error)
    return { data: null, error: wrapError("fetchLeaderRubricGrade", error) };
  if (!data) return { data: null, error: null };

  return {
    data: {
      profile_id: data.profile_id,
      ministry_year: data.ministry_year,
      criterion_scores: decodeScores(data.criterion_scores),
      computed_letter: data.computed_letter,
      override_letter: data.override_letter,
      override_scope: data.override_scope,
      override_period_month: data.override_period_month,
      updated_at: data.updated_at,
    },
    error: null,
  };
}
