import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
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

// The persisted Leader-Health Grade row read moved to the column-allowlisted
// reads seam (lib/supabase/leader-rubric-grade-reads), so it is typed I/O behind
// the seam rather than an `as never` cast. Re-exported here so the shepherd-care
// detail surface keeps its existing import and seam binding unchanged.
export {
  fetchLeaderRubricGradeRow as fetchLeaderRubricGrade,
  type LeaderRubricGradeRow,
} from "@/lib/supabase/leader-rubric-grade-reads";
