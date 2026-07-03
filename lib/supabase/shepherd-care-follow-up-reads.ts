import type { ShepherdCareFollowUpsRow } from "@/types/database";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase SC.1B — Shepherd care follow-ups (admin-only task list) read models.
// One sub-domain of the former shepherd-care-reads module; its siblings are
// shepherd-care-directory-reads, shepherd-care-interaction-reads,
// shepherd-coverage-reads, and shepherd-care-private-note-reads. (The generic
// follow_ups table's readers live in follow-up-reads.ts — distinct surface.)
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_follow_ups. Same privacy
 * posture as the SC.1A care constants — never used outside an admin
 * code path, and `select("*")` never appears on care tables. The table-level
 * RLS already restricts SELECT to super_admin / ministry_admin and admits no
 * over_shepherd / leader read path; this allowlist is the defensive belt-and-
 * braces.
 *
 * Privacy contract: care follow-ups (incl. `title` and `notes` bodies) are
 * admin-only pastoral task content. They must NEVER be read on a leader,
 * over-shepherd, or aggregate-visible-to-another-tier path. There is
 * deliberately no leader/over-shepherd reader for this table.
 *
 * If you add a column, also extend `ShepherdCareFollowUpsRow` in
 * types/database.ts.
 */
export const SHEPHERD_CARE_FOLLOW_UP_COLUMNS =
  columns<ShepherdCareFollowUpsRow>()(
    "id",
    "care_profile_id",
    "title",
    "due_date",
    "status",
    "notes",
    "created_by_profile_id",
    "created_at",
    "updated_at",
    "completed_at",
    "archived_at"
  );

/**
 * Admin-only list of care follow-ups for one care profile. Returns the raw
 * rows in a stable order (outstanding before done, then soonest due date);
 * the urgency ordering / overdue bucketing the UI renders is computed by the
 * pure helpers in lib/admin/shepherd-care-follow-ups.ts from this set.
 */
export async function fetchShepherdCareFollowUpsForProfile(
  client: ReadClient,
  careProfileId: string
): Promise<ReadResult<ShepherdCareFollowUpsRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_follow_ups")
    .select(SHEPHERD_CARE_FOLLOW_UP_COLUMNS.select)
    .eq("care_profile_id", careProfileId)
    // Archived (soft-deleted) follow-ups drop out of the list entirely.
    .is("archived_at", null)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareFollowUpsForProfile", error),
    };
  }
  return { data: (data ?? []) as ShepherdCareFollowUpsRow[], error: null };
}

// Minimal cross-profile projection the SC.3 dashboard needs to surface
// overdue/open care follow-ups. EXCLUDES title / notes bodies — the
// dashboard only counts and buckets by status + due date, then links to the
// per-shepherd detail page for the task content.
export type CareFollowUpDashboardRow = {
  id: string;
  care_profile_id: string;
  status: ShepherdCareFollowUpsRow["status"];
  due_date: string | null;
};

const SHEPHERD_CARE_DASHBOARD_FOLLOW_UP_COLUMNS =
  columns<CareFollowUpDashboardRow>()(
    "id",
    "care_profile_id",
    "status",
    "due_date"
  );

/**
 * Admin-only feed of every OUTSTANDING (not-done) care follow-up across all
 * profiles, used by the SC.3 dashboard to roll up overdue/open tasks per
 * shepherd. Done rows are excluded at the database level (matches the
 * partial index) so the scan stays cheap. Note bodies are never projected.
 */
export async function fetchOutstandingCareFollowUpsForAdmin(
  client: ReadClient
): Promise<ReadResult<CareFollowUpDashboardRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_follow_ups")
    .select(SHEPHERD_CARE_DASHBOARD_FOLLOW_UP_COLUMNS.select)
    .neq("status", "done")
    // Archived (soft-deleted) follow-ups never surface in the outstanding feed.
    .is("archived_at", null)
    .range(0, 9999);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOutstandingCareFollowUpsForAdmin", error),
    };
  }
  return { data: (data ?? []) as CareFollowUpDashboardRow[], error: null };
}

// Minimal cross-profile projection for the Care area's Completed tab (#301).
// Like CareFollowUpDashboardRow it EXCLUDES title / notes bodies — the
// Completed list shows who, when, and a "View follow-up" link into the
// per-leader detail page for the task content; it never ships note bodies to
// the aggregate surface.
export type CareFollowUpCompletedRow = {
  id: string;
  care_profile_id: string;
  status: ShepherdCareFollowUpsRow["status"];
  due_date: string | null;
  completed_at: string | null;
};

const SHEPHERD_CARE_COMPLETED_FOLLOW_UP_COLUMNS =
  columns<CareFollowUpCompletedRow>()(
    "id",
    "care_profile_id",
    "status",
    "due_date",
    "completed_at"
  );

/**
 * Admin-only feed of recently COMPLETED (done) care follow-ups across all
 * profiles, used by the Care area's Completed tab (#301). Ordered by
 * completion recency and capped, since the tab only shows the recent tail.
 * Note bodies are never projected.
 */
export async function fetchRecentlyCompletedCareFollowUpsForAdmin(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<CareFollowUpCompletedRow[]>> {
  const limit = options.limit ?? 50;
  const { data, error } = await client
    .from("shepherd_care_follow_ups")
    .select(SHEPHERD_CARE_COMPLETED_FOLLOW_UP_COLUMNS.select)
    .eq("status", "done")
    // Archived (soft-deleted) follow-ups drop out of the completed feed too.
    .is("archived_at", null)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .range(0, Math.max(0, limit - 1));
  if (error) {
    return {
      data: null,
      error: wrapError("fetchRecentlyCompletedCareFollowUpsForAdmin", error),
    };
  }
  return { data: (data ?? []) as CareFollowUpCompletedRow[], error: null };
}

/**
 * Count of OUTSTANDING generic `follow_ups` (open + in_progress) assigned to
 * a profile. Powers the one-way cross-link glance on the care detail page
 * (issue #107 story 20): the care UI may show how many generic follow-ups a
 * shepherd owns, WITHOUT the generic surface ever reading care tables. Uses a
 * head count so no follow-up bodies (incl. admin_private_note) leave the
 * server.
 */
export async function fetchGenericFollowUpCountForAssignee(
  client: ReadClient,
  profileId: string
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", profileId)
    .in("status", ["open", "in_progress"]);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchGenericFollowUpCountForAssignee", error),
    };
  }
  return { data: count ?? 0, error: null };
}
