import type { ShepherdCareInteractionsRow } from "@/types/database";
import { ELIGIBLE_SHEPHERD_ROLES } from "./shepherd-coverage-reads";
import {
  columns,
  projectJoinRows,
  unwrapEmbed,
  wrapError,
  type EmbeddedToOne,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker (admin-only) interaction read models.
// One sub-domain of the former shepherd-care-reads module; its siblings are
// shepherd-care-directory-reads, shepherd-care-follow-up-reads,
// shepherd-coverage-reads, and shepherd-care-private-note-reads.
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_interactions. Same
 * privacy posture as the shepherd_care_profiles allowlist — never used
 * outside an admin code path.
 */
export const SHEPHERD_CARE_INTERACTION_COLUMNS =
  columns<ShepherdCareInteractionsRow>()(
    "id",
    "care_profile_id",
    "interaction_at",
    "interaction_type",
    "notes",
    "created_by_profile_id",
    "created_at"
  );

/**
 * Admin-only interaction history for one care profile. Append-only
 * ordering: most recent first by `interaction_at`, tiebreak by
 * `created_at` so multiple touches on the same day stay stable.
 */
export async function fetchShepherdCareInteractionsForAdmin(
  client: ReadClient,
  careProfileId: string
): Promise<ReadResult<ShepherdCareInteractionsRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(SHEPHERD_CARE_INTERACTION_COLUMNS.select)
    .eq("care_profile_id", careProfileId)
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareInteractionsForAdmin", error),
    };
  }
  return {
    data: (data ?? []) as ShepherdCareInteractionsRow[],
    error: null,
  };
}

/**
 * Admin-only column allowlist for cross-shepherd recent interactions used by
 * the Julian dashboard. EXCLUDES `notes` — the dashboard surfaces shepherd
 * name, date, and interaction type only, then links to the per-shepherd
 * detail page for note bodies.
 *
 * Both joins are `!inner` so the role/status filters applied at query time
 * (active `leader` / `co_leader` only) prune rows whose shepherd has been
 * deactivated or moved off the eligible roles. Without this filter the feed
 * would link to detail pages that return 404 for those profiles.
 */
// Raw select string by necessity: columns<Row>() cannot express embed
// fragments (FK hints + !inner markers), so this stays hand-written.
export const SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS =
  "id, care_profile_id, interaction_at, interaction_type, created_at, " +
  "care_profile:shepherd_care_profiles!shepherd_care_interactions_care_profile_id_fkey!inner ( " +
  "shepherd_profile_id, " +
  "shepherd:profiles!shepherd_care_profiles_shepherd_profile_id_fkey!inner ( id, full_name, role, status ) " +
  ")";

export type ShepherdCareRecentInteractionRow = {
  id: string;
  care_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionsRow["interaction_type"];
  created_at: string;
  shepherd_profile_id: string;
  shepherd_full_name: string;
};

type RecentInteractionJoinCareProfile = {
  shepherd_profile_id: string;
  shepherd: EmbeddedToOne<{ id: string; full_name: string }>;
};

type RecentInteractionJoinRow = {
  id: string;
  care_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionsRow["interaction_type"];
  created_at: string;
  care_profile: EmbeddedToOne<RecentInteractionJoinCareProfile>;
};

function projectRecentInteractionRows(
  rows: unknown[]
): ShepherdCareRecentInteractionRow[] {
  return projectJoinRows(rows as RecentInteractionJoinRow[], (r) => {
    const cp = unwrapEmbed(r.care_profile);
    if (cp === null) return null;
    const shepherd = unwrapEmbed(cp.shepherd);
    if (shepherd === null) return null;
    return {
      id: r.id,
      care_profile_id: r.care_profile_id,
      interaction_at: r.interaction_at,
      interaction_type: r.interaction_type,
      created_at: r.created_at,
      shepherd_profile_id: cp.shepherd_profile_id,
      shepherd_full_name: shepherd.full_name,
    };
  });
}

/**
 * Admin-only cross-shepherd interactions feed used by the Julian dashboard.
 * Returns the most recent N interactions across every care profile, ordered
 * by `interaction_at desc` then `created_at desc`. Note bodies intentionally
 * excluded from the projection — surface them only on the detail page.
 */
export async function fetchRecentShepherdCareInteractionsForAdmin(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<ShepherdCareRecentInteractionRow[]>> {
  const limit = options.limit ?? 10;
  // Filters apply to the embedded inner-join columns, which excludes
  // interactions whose shepherd has been deactivated or moved off the
  // eligible roles. Matches the same belt-and-braces filter used by
  // fetchActiveShepherdCoverageAssignmentsForAdmin.
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS)
    .eq("care_profile.shepherd.status", "active")
    .in("care_profile.shepherd.role", ELIGIBLE_SHEPHERD_ROLES)
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchRecentShepherdCareInteractionsForAdmin", error),
    };
  }
  return {
    data: projectRecentInteractionRows((data ?? []) as unknown[]),
    error: null,
  };
}
