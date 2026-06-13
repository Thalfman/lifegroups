import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { decodeRubricCriteria } from "@/lib/admin/health-rubric";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { fetchGroupRubricGradeRow } from "@/lib/supabase/group-rubric-grade-reads";
import { wrapError, type ReadResult } from "@/lib/supabase/read-core";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import {
  resolveGroupRubricGrade,
  type GroupRubricGrade,
} from "@/lib/admin/group-rubric-grade";

// Model side for the Group-Health Grade by rubric (#377 / ADR 0018, Pivot slice
// 4). Reads the configured group rubric + the persisted grade row (the latter
// through the column-allowlisted reads seam,
// lib/supabase/group-rubric-grade-reads) and recomputes the effective letter
// live via the pure facade, so the surface and the Multiplication pillar see one
// effective letter. Admin-only data, behind the admin layout guard and the
// table's admin-only RLS.

// A group's resolved rubric grade for a ministry year, plus the raw per-criterion
// scores and last-saved timestamp the editor needs to pre-fill. `grade` is null
// only when no grade has ever been entered AND nothing is currently scored.
export type GroupRubricGradeView = {
  group_id: string;
  ministry_year: number;
  // Per-criterion 0–100 scores keyed by criterion key (empty when unscored).
  criterion_scores: Record<string, number>;
  // The fully resolved grade (computed letter, effective letter, override flag),
  // recomputed live from the stored scores via the pure facade.
  grade: GroupRubricGrade;
  // When the grade was last persisted, or null when nothing has been saved yet.
  last_saved_at: string | null;
};

// Fetch + resolve a group's rubric grade for the given ministry year. Reads the
// configured group rubric and the persisted grade row, then recomputes the
// effective letter live via the facade so a surface never trusts a possibly-stale
// stored letter. A missing grade row is success-with-empty-scores, not an error.
export async function getGroupRubricGrade(
  client: AppSupabaseClient,
  groupId: string,
  ministryYear: number,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupRubricGradeView>> {
  const rubricRes = await fetchHealthRubric(client, "group");
  if (rubricRes.error)
    return {
      data: null,
      error: wrapError("getGroupRubricGrade/rubric", rubricRes.error),
    };
  const criteria = decodeRubricCriteria(rubricRes.data?.criteria ?? null);

  const { data, error } = await fetchGroupRubricGradeRow(
    client,
    groupId,
    ministryYear
  );
  if (error)
    return { data: null, error: wrapError("getGroupRubricGrade", error) };

  const scores = data?.criterion_scores ?? {};
  const override =
    data?.override_letter && data?.override_scope
      ? {
          letter: data.override_letter,
          scope: data.override_scope,
          // Resolve expiry against the month the override was actually set for,
          // not the current period — otherwise an expired "this_month" override
          // would read as perpetually active here and in the Multiplication
          // rollup built from this view.
          period_month: data.override_period_month ?? periodMonthIso,
        }
      : null;

  const grade = resolveGroupRubricGrade({
    rubric: { criteria },
    scores,
    override,
    periodMonth: periodMonthIso,
  });

  return {
    data: {
      group_id: groupId,
      ministry_year: ministryYear,
      criterion_scores: scores,
      grade,
      last_saved_at: data?.updated_at ?? null,
    },
    error: null,
  };
}
