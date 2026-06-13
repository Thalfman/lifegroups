import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";
import { wrapError, type ReadResult } from "@/lib/supabase/read-core";

// Read side for the persisted Group-Health Grade row (#377 / ADR 0018), behind
// the reads seam (ADR 0015): the surface that needs it binds this through
// `bindReads`, and its tests inject an in-memory adapter satisfying the same
// interface. Admin-only data — runs under the admin layout guard and the table's
// admin-only RLS. Column-allowlisted (named columns, never select("*")). The
// table is in the typed schema (types/database.ts › group_rubric_grades), so the
// select is fully typed — no `as never` cast. Resolution into an effective
// letter stays in the model (lib/admin/group-rubric-grade), keeping this pure I/O.

export const GROUP_RUBRIC_GRADE_COLUMNS =
  "group_id, ministry_year, criterion_scores, computed_letter, " +
  "override_letter, override_scope, override_period_month, updated_at";

// One persisted Group-Health Grade row, read through the column allowlist.
// `criterion_scores` arrives as raw jsonb; the model decodes it at the trust
// boundary when it resolves the effective letter.
export type GroupRubricGradeRow = {
  group_id: string;
  ministry_year: number;
  criterion_scores: Record<string, number> | null;
  computed_letter: GroupHealthLetter | null;
  override_letter: GroupHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// Fetch a group's persisted rubric grade row for a ministry year, or null when
// none has been entered yet (success-with-null, not an error).
export async function fetchGroupRubricGradeRow(
  client: AppSupabaseClient,
  groupId: string,
  ministryYear: number
): Promise<ReadResult<GroupRubricGradeRow | null>> {
  const { data, error } = await client
    .from("group_rubric_grades")
    .select(GROUP_RUBRIC_GRADE_COLUMNS)
    .eq("group_id", groupId)
    .eq("ministry_year", ministryYear)
    .maybeSingle<GroupRubricGradeRow>();

  if (error)
    return { data: null, error: wrapError("fetchGroupRubricGradeRow", error) };
  return { data: data ?? null, error: null };
}
