import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  LeaderHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";
import {
  wrapError,
  decodeNumericRecord,
  type ReadResult,
} from "@/lib/supabase/read-core";

// Read side for the persisted Leader-Health Grade row (#378 / ADR 0018), behind
// the reads seam (ADR 0015). Admin-only data — runs under the admin layout guard
// and the table's admin-only RLS. Column-allowlisted (named columns, never
// select("*")). The table is in the typed schema (types/database.ts ›
// leader_rubric_grades), so the select is fully typed — no `as never` cast. The
// raw jsonb `criterion_scores` is decoded to a clean Record at the trust
// boundary here; the effective-letter resolution lives in the model.

export const LEADER_RUBRIC_GRADE_COLUMNS =
  "profile_id, ministry_year, criterion_scores, computed_letter, " +
  "override_letter, override_scope, override_period_month, updated_at";

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

// The raw row shape before the trust-boundary decode (criterion_scores is jsonb).
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

// Fetch a leader's persisted Leader-Health Grade for a ministry year, or null
// when none has been entered yet (the success-with-null case, not an error).
export async function fetchLeaderRubricGradeRow(
  client: AppSupabaseClient,
  profileId: string,
  ministryYear: number
): Promise<ReadResult<LeaderRubricGradeRow | null>> {
  const { data, error } = await client
    .from("leader_rubric_grades")
    .select(LEADER_RUBRIC_GRADE_COLUMNS)
    .eq("profile_id", profileId)
    .eq("ministry_year", ministryYear)
    .maybeSingle<PersistedLeaderGrade>();

  if (error)
    return { data: null, error: wrapError("fetchLeaderRubricGradeRow", error) };
  if (!data) return { data: null, error: null };

  return {
    data: {
      profile_id: data.profile_id,
      ministry_year: data.ministry_year,
      criterion_scores: decodeNumericRecord(data.criterion_scores),
      computed_letter: data.computed_letter,
      override_letter: data.override_letter,
      override_scope: data.override_scope,
      override_period_month: data.override_period_month,
      updated_at: data.updated_at,
    },
    error: null,
  };
}
