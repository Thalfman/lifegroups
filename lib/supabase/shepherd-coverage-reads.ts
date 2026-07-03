import type {
  OverShepherdsRow,
  ProfilesRow,
  ShepherdCoverageAssignmentsRow,
} from "@/types/database";
import {
  columns,
  unwrapEmbed,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking (SC.2) read models.
// One sub-domain of the former shepherd-care-reads module; its siblings are
// shepherd-care-directory-reads, shepherd-care-interaction-reads,
// shepherd-care-follow-up-reads, and shepherd-care-private-note-reads. (The
// Over-Shepherd surface's own coverage-scoped readers live in
// lib/over-shepherd/over-shepherd-reads.ts — these are the admin-side reads.)
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for over_shepherds list reads. EXCLUDES
 * `notes` — directory and summary cards never render note bodies, so
 * the column doesn't leave the server. Use OVER_SHEPHERD_DETAIL_COLUMNS
 * when loading a single record for the edit form.
 */
export const OVER_SHEPHERD_LIST_COLUMNS = columns<OverShepherdsRow>()(
  "id",
  "full_name",
  "email",
  "phone",
  "active",
  "archived_at",
  "created_at",
  "updated_at"
);

/**
 * Admin-only column allowlist that INCLUDES `notes`. Used only by the
 * over-shepherd edit form's loader. Pinned to the same row as the list columns
 * via `columns<…>()`, with `notes` added.
 */
export const OVER_SHEPHERD_DETAIL_COLUMNS = columns<OverShepherdsRow>()(
  ...OVER_SHEPHERD_LIST_COLUMNS.list,
  "notes"
);

export const SHEPHERD_COVERAGE_ASSIGNMENT_COLUMNS =
  columns<ShepherdCoverageAssignmentsRow>()(
    "id",
    "shepherd_profile_id",
    "over_shepherd_id",
    "active",
    "assigned_at",
    "ended_at",
    "created_at",
    "updated_at"
  );

export type OverShepherdListRow = Pick<
  OverShepherdsRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "active"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

export type ActiveShepherdCoverageAssignmentSummary = Pick<
  ShepherdCoverageAssignmentsRow,
  "id" | "shepherd_profile_id" | "over_shepherd_id" | "assigned_at"
> & {
  over_shepherd: Pick<OverShepherdsRow, "id" | "full_name" | "active">;
};

/**
 * Admin-only list of over-shepherds. Excludes notes from the projection
 * so the directory and summary views never receive note bodies. RLS on
 * the table additionally restricts SELECT to super_admin / ministry_admin.
 */
export async function fetchOverShepherdsForAdmin(
  client: ReadClient,
  options: { includeArchived?: boolean } = {}
): Promise<ReadResult<OverShepherdListRow[]>> {
  let query = client
    .from("over_shepherds")
    .select(OVER_SHEPHERD_LIST_COLUMNS.select)
    .order("active", { ascending: false })
    .order("full_name", { ascending: true });
  if (!options.includeArchived) {
    query = query.eq("active", true);
  }
  const { data, error } = await query;
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdsForAdmin", error),
    };
  }
  return { data: (data ?? []) as OverShepherdListRow[], error: null };
}

/**
 * Admin-only single-record lookup including notes. Used only by the edit
 * form loader — list/directory paths must use fetchOverShepherdsForAdmin
 * (which omits notes).
 */
export async function fetchOverShepherdByIdForAdmin(
  client: ReadClient,
  overShepherdId: string
): Promise<ReadResult<OverShepherdsRow | null>> {
  const { data, error } = await client
    .from("over_shepherds")
    .select(OVER_SHEPHERD_DETAIL_COLUMNS.select)
    .eq("id", overShepherdId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdByIdForAdmin", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  return { data: data as OverShepherdsRow, error: null };
}

function projectCoverageAssignmentRows(
  rows: unknown[]
): ActiveShepherdCoverageAssignmentSummary[] {
  const summaries: ActiveShepherdCoverageAssignmentSummary[] = [];
  for (const r of rows as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
    over_shepherd:
      | { id: string; full_name: string; active: boolean }
      | { id: string; full_name: string; active: boolean }[]
      | null;
  }>) {
    const embedded = unwrapEmbed(r.over_shepherd);
    if (embedded === null) continue;
    summaries.push({
      id: r.id,
      shepherd_profile_id: r.shepherd_profile_id,
      over_shepherd_id: r.over_shepherd_id,
      assigned_at: r.assigned_at,
      over_shepherd: {
        id: embedded.id,
        full_name: embedded.full_name,
        active: embedded.active,
      },
    });
  }
  return summaries;
}

const ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT =
  "id, shepherd_profile_id, over_shepherd_id, assigned_at, " +
  "over_shepherd:over_shepherds!shepherd_coverage_assignments_over_shepherd_id_fkey ( id, full_name, active ), " +
  "shepherd:profiles!shepherd_coverage_assignments_shepherd_profile_id_fkey!inner ( id, role, status )";

// Filter spec that excludes coverage rows whose shepherd has become
// ineligible (deactivated or role moved off leader/co_leader). The
// admin_deactivate_profile cascade in
// 20260518180000_phase5d1_over_shepherd_coverage_hardening.sql closes
// the row on deactivation, but role-change RPCs from earlier phases
// don't, so this read-side filter is the belt-and-braces. Exported so the
// recent-interactions feed (shepherd-care-interaction-reads.ts) applies the
// exact same eligibility filter from one source of truth.
export const ELIGIBLE_SHEPHERD_ROLES: string[] = ["leader", "co_leader"];

/**
 * Admin-only list of currently active coverage assignments, joined with
 * the active over-shepherd's display name. One row per active
 * shepherd_profile_id (enforced by the partial unique index in
 * 20260518170000_phase5d1_over_shepherd_coverage.sql). Callers key the
 * returned array by shepherd_profile_id in memory to avoid N+1 reads
 * from the directory page.
 */
export async function fetchActiveShepherdCoverageAssignmentsForAdmin(
  client: ReadClient
): Promise<ReadResult<ActiveShepherdCoverageAssignmentSummary[]>> {
  // The embedded `shepherd:profiles!...!inner` makes the join required,
  // and the `shepherd.status` / `shepherd.role` filters apply to the
  // joined row — so rows whose shepherd has been deactivated or moved
  // off leader/co_leader are excluded from the result.
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT)
    .eq("active", true)
    .eq("shepherd.status", "active")
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchActiveShepherdCoverageAssignmentsForAdmin", error),
    };
  }
  return {
    data: projectCoverageAssignmentRows((data ?? []) as unknown[]),
    error: null,
  };
}

/**
 * Admin-only single-row lookup for the active coverage assignment of one
 * shepherd. Used by the per-shepherd detail page so it doesn't pay the
 * cost of scanning the whole assignments table. Returns null when no
 * active row exists.
 */
export async function fetchActiveShepherdCoverageAssignmentByShepherdId(
  client: ReadClient,
  shepherdProfileId: string
): Promise<ReadResult<ActiveShepherdCoverageAssignmentSummary | null>> {
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT)
    .eq("shepherd_profile_id", shepherdProfileId)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError(
        "fetchActiveShepherdCoverageAssignmentByShepherdId",
        error
      ),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  const [summary] = projectCoverageAssignmentRows([data as unknown]);
  return { data: summary ?? null, error: null };
}

export type ShepherdCoveredByOverShepherd = {
  assignment: Pick<
    ShepherdCoverageAssignmentsRow,
    "id" | "shepherd_profile_id" | "over_shepherd_id" | "assigned_at"
  >;
  shepherd: Pick<ProfilesRow, "id" | "full_name">;
};

/**
 * Admin-only list of shepherds currently covered by one over-shepherd,
 * joined with the shepherd's display name. Filters at the database
 * level on `over_shepherd_id` + `active = true` so the over-shepherd
 * detail page doesn't pull every active assignment in the org.
 */
export async function fetchShepherdsCoveredByOverShepherdForAdmin(
  client: ReadClient,
  overShepherdId: string
): Promise<ReadResult<ShepherdCoveredByOverShepherd[]>> {
  // `!inner` makes the profiles join required; status/role filters
  // exclude shepherds who have been deactivated or moved off
  // leader/co_leader since their coverage row was created. Belt-and-
  // braces against role-change RPCs that don't yet cascade.
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(
      "id, shepherd_profile_id, over_shepherd_id, assigned_at, " +
        "shepherd:profiles!shepherd_coverage_assignments_shepherd_profile_id_fkey!inner ( id, full_name, role, status )"
    )
    .eq("over_shepherd_id", overShepherdId)
    .eq("active", true)
    .eq("shepherd.status", "active")
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdsCoveredByOverShepherdForAdmin", error),
    };
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
    shepherd:
      | { id: string; full_name: string; role: string; status: string }
      | { id: string; full_name: string; role: string; status: string }[]
      | null;
  }>;
  const out: ShepherdCoveredByOverShepherd[] = [];
  for (const r of rows) {
    const embedded = unwrapEmbed(r.shepherd);
    if (embedded === null) continue;
    out.push({
      assignment: {
        id: r.id,
        shepherd_profile_id: r.shepherd_profile_id,
        over_shepherd_id: r.over_shepherd_id,
        assigned_at: r.assigned_at,
      },
      shepherd: { id: embedded.id, full_name: embedded.full_name },
    });
  }
  out.sort((a, b) => a.shepherd.full_name.localeCompare(b.shepherd.full_name));
  return { data: out, error: null };
}
