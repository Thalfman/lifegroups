// Coverage-scoped read layer for the Over-Shepherd surface
// (docs/adr/0002-oversight-ladder-and-leader-gating.md).
//
// These mirror the admin shepherd-care reads but with two hard differences:
//   1. Every read is scoped to the Over-Shepherd's actively-covered Shepherd
//      ids (resolved by the Phase OS.2 coverage bridge). Row-level scoping is
//      ultimately enforced in RLS; passing the id set to `.in(...)` keeps the
//      response tight and gives the surface a defense-in-depth scope.
//   2. The admin-only shepherd_care_profiles.admin_summary is NEVER selected.
//      We use a column allowlist that omits it (mirroring the leader
//      follow-up column-allowlist precedent) plus a typed Omit<> row, so
//      admin_summary can't leak onto this path even though the row policy
//      grants the profile row. No `select("*")` is used against care tables.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  ProfilesRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
} from "@/types/database";
import {
  type ReadResult,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareDirectorySummary,
  SHEPHERD_CARE_INTERACTION_COLUMNS,
  computeNeedsAttention,
  currentUtcDateIso,
} from "@/lib/supabase/read-models";

type ReadClient = AppSupabaseClient;

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

// Column allowlist for shepherd_care_profiles on the Over-Shepherd path.
// admin_summary is intentionally absent — the load-bearing exclusion that
// keeps the admin-only field off this surface.
export const OVER_SHEPHERD_CARE_PROFILE_COLUMNS =
  "id, shepherd_profile_id, current_status, last_contact_at, " +
  "next_touchpoint_due, archived_at, created_at, updated_at";

// Typed row for the Over-Shepherd care profile read: the full row minus the
// admin-only field, so a future `admin_summary` reader on this path is a
// compile error, not a runtime leak.
export type OverShepherdCareProfile = Omit<ShepherdCareProfilesRow, "admin_summary">;

/**
 * Directory of the Shepherds an Over-Shepherd actively covers, joined with
 * each Shepherd's care summary (or null when no care row exists yet). Scoped
 * to `coveredShepherdIds`; an empty id set short-circuits to an empty
 * directory (and keeps the `.in("col", [])` edge case off the wire).
 */
export async function fetchOverShepherdCareDirectory(
  client: ReadClient,
  coveredShepherdIds: string[],
  options: { todayIso?: string; staleDays?: number } = {},
): Promise<ReadResult<ShepherdCareDirectoryEntry[]>> {
  if (coveredShepherdIds.length === 0) {
    return { data: [], error: null };
  }

  const profilesQuery = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .in("id", coveredShepherdIds)
    .order("full_name", { ascending: true });
  if (profilesQuery.error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdCareDirectory/profiles", profilesQuery.error),
    };
  }

  const careByShepherdId = new Map<string, ShepherdCareDirectorySummary>();
  const careQuery = await client
    .from("shepherd_care_profiles")
    .select(OVER_SHEPHERD_CARE_PROFILE_COLUMNS)
    .in("shepherd_profile_id", coveredShepherdIds);
  if (careQuery.error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdCareDirectory/care", careQuery.error),
    };
  }
  for (const row of (careQuery.data ?? []) as ShepherdCareDirectorySummary[]) {
    careByShepherdId.set(row.shepherd_profile_id, row);
  }

  const today = options.todayIso ?? currentUtcDateIso();

  const entries: ShepherdCareDirectoryEntry[] = (profilesQuery.data ?? []).map(
    (p) => {
      const profile = p as Pick<
        ProfilesRow,
        "id" | "full_name" | "email" | "role" | "status"
      >;
      const care = careByShepherdId.get(profile.id) ?? null;
      return {
        profile,
        care,
        needs_attention: computeNeedsAttention(care, today, options.staleDays),
      };
    },
  );

  return { data: entries, error: null };
}

/**
 * Single covered-Shepherd care profile, keyed by the Shepherd's profile id.
 * Returns null when no care row exists yet (the page renders "needs first
 * contact"). admin_summary is never selected.
 */
export async function fetchOverShepherdCareProfileByShepherdId(
  client: ReadClient,
  shepherdProfileId: string,
): Promise<ReadResult<OverShepherdCareProfile | null>> {
  const { data, error } = await client
    .from("shepherd_care_profiles")
    .select(OVER_SHEPHERD_CARE_PROFILE_COLUMNS)
    .eq("shepherd_profile_id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdCareProfileByShepherdId", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  return { data: data as OverShepherdCareProfile, error: null };
}

/**
 * Care-interaction history for one covered care profile. Same shape and
 * ordering as the admin read — interaction notes are broad care notes the
 * Over-Shepherd is permitted to read; there is no admin-only field on this
 * table.
 */
export async function fetchOverShepherdCareInteractions(
  client: ReadClient,
  careProfileId: string,
): Promise<ReadResult<ShepherdCareInteractionsRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(SHEPHERD_CARE_INTERACTION_COLUMNS)
    .eq("care_profile_id", careProfileId)
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdCareInteractions", error),
    };
  }
  return {
    data: (data ?? []) as ShepherdCareInteractionsRow[],
    error: null,
  };
}
