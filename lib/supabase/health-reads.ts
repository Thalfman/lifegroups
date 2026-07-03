// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type {
  GroupHealthAssessmentsRow,
  GroupHealthUpdatesRow,
} from "@/types/database";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

export type GroupHealthAssessmentRatingRow = Pick<
  GroupHealthAssessmentsRow,
  "group_id" | "spiritual_growth_score" | "group_question_score"
>;

export const GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS =
  columns<GroupHealthAssessmentsRow>()(
    "group_id",
    "spiritual_growth_score",
    "group_question_score"
  );

export async function fetchGroupHealthAssessmentRatings(
  client: ReadClient,
  options: { periodMonth: string }
): Promise<ReadResult<GroupHealthAssessmentRatingRow[]>> {
  const { data, error } = await client
    .from("group_health_assessments")
    .select(GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS.select)
    .eq("period_month", options.periodMonth)
    .returns<GroupHealthAssessmentRatingRow[]>();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchGroupHealthAssessmentRatings", error),
    };
  }
  return { data: data ?? [], error: null };
}

// Column allowlist for the group-health-update fetcher (#495); every
// GroupHealthUpdatesRow column (the admin review renders leader_note and
// admin_note side by side), pinned by a colocated test.
export const GROUP_HEALTH_UPDATE_COLUMNS = columns<GroupHealthUpdatesRow>()(
  "id",
  "group_id",
  "submitted_by",
  "update_week",
  "pulse",
  "follow_up_needed",
  "leader_note",
  "admin_note",
  "created_at"
);

export async function fetchLatestHealthUpdates(
  client: ReadClient,
  options: { groupId?: string; updateWeek?: string } = {}
): Promise<ReadResult<GroupHealthUpdatesRow[]>> {
  let query = client
    .from("group_health_updates")
    .select(GROUP_HEALTH_UPDATE_COLUMNS.select)
    .order("update_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.updateWeek) query = query.eq("update_week", options.updateWeek);
  const { data, error } = await query.returns<GroupHealthUpdatesRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchLatestHealthUpdates", error) };
  return { data: data ?? [], error: null };
}
