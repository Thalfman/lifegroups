// Coverage-scoped read layer for the Over-Shepherd surface
// (docs/adr/0002-oversight-ladder-and-leader-gating.md).
//
// These mirror the admin shepherd-care reads but with two hard differences:
//   1. Every read is scoped to the Over-Shepherd's actively-covered Shepherd
//      ids (resolved by the Phase OS.2 coverage bridge). Row-level scoping is
//      ultimately enforced in RLS; passing the id set to `.in(...)` keeps the
//      response tight and gives the surface a defense-in-depth scope.
//   2. The admin-only care summary is NEVER read here. As of phase_os5 it
//      lives in its own admin-only table (shepherd_care_admin_notes) fenced by
//      RLS, so it is unreachable on this path at the database level — not just
//      because the row policy grants the profile row. This column allowlist
//      (which omits it) plus the typed Omit<> row remain as a defense-in-depth
//      belt. No `select("*")` is used against care tables.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  ProfilesRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
} from "@/types/database";
import { columns, type ReadResult } from "@/lib/supabase/read-core";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import {
  fetchCareNotesForSubject,
  fetchPrayerRequestsForSubject,
} from "@/lib/supabase/care-note-reads";
import {
  type ShepherdCareDirectoryEntry,
  type ShepherdCareDirectorySummary,
  SHEPHERD_CARE_DIRECTORY_COLUMNS,
  buildCareDirectoryEntries,
} from "@/lib/supabase/shepherd-care-directory-reads";
import { fetchShepherdCareInteractionsForAdmin } from "@/lib/supabase/shepherd-care-interaction-reads";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";

type ReadClient = AppSupabaseClient;

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

// Column allowlist for shepherd_care_profiles on the Over-Shepherd path. This
// is identical to the admin directory projection (admin_summary lives in its
// own fenced table as of phase_os5), so reuse that single source of truth
// rather than maintaining a byte-identical copy. Re-exported under this name
// for the read surface + the admin_summary-exclusion test.
export const OVER_SHEPHERD_CARE_PROFILE_COLUMNS =
  SHEPHERD_CARE_DIRECTORY_COLUMNS;

// Typed row for the Over-Shepherd care profile read: the full row minus the
// admin-only field, so a future `admin_summary` reader on this path is a
// compile error, not a runtime leak.
export type OverShepherdCareProfile = Omit<
  ShepherdCareProfilesRow,
  "admin_summary"
>;

// The covered-Shepherd identity projection for the directory's profiles read.
const OVER_SHEPHERD_COVERED_PROFILE_COLUMNS = columns<
  Pick<ProfilesRow, "id" | "full_name" | "email" | "role" | "status">
>()("id", "full_name", "email", "role", "status");

/**
 * Directory of the Shepherds an Over-Shepherd actively covers, joined with
 * each Shepherd's care summary (or null when no care row exists yet). Scoped
 * to `coveredShepherdIds`; an empty id set short-circuits to an empty
 * directory (and keeps the `.in("col", [])` edge case off the wire).
 */
export async function fetchOverShepherdCareDirectory(
  client: ReadClient,
  coveredShepherdIds: string[],
  // No delegatedShepherdIds is passed through to buildCareDirectoryEntries:
  // every shepherd an over-shepherd covers is delegated by definition, so they
  // all use the delegated staleness window (Julian Q5).
  options: { todayIso?: string; windows?: CareCadenceWindows } = {}
): Promise<ReadResult<ShepherdCareDirectoryEntry[]>> {
  if (coveredShepherdIds.length === 0) {
    return { data: [], error: null };
  }

  // The profiles read and the care read are both scoped by coveredShepherdIds
  // and independent of each other, so issue them in parallel rather than
  // serially. The profiles read also filters status='active' so a deactivated
  // Shepherd left on a stale active coverage row never surfaces here (matching
  // the admin directory, which filters the same way).
  const [profilesQuery, careQuery] = await Promise.all([
    client
      .from("profiles")
      .select(OVER_SHEPHERD_COVERED_PROFILE_COLUMNS.select)
      .in("id", coveredShepherdIds)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    client
      .from("shepherd_care_profiles")
      .select(OVER_SHEPHERD_CARE_PROFILE_COLUMNS.select)
      .in("shepherd_profile_id", coveredShepherdIds),
  ]);
  if (profilesQuery.error) {
    return {
      data: null,
      error: wrapError(
        "fetchOverShepherdCareDirectory/profiles",
        profilesQuery.error
      ),
    };
  }
  if (careQuery.error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdCareDirectory/care", careQuery.error),
    };
  }

  const profiles = (profilesQuery.data ?? []) as Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[];
  const careRows = (careQuery.data ?? []) as ShepherdCareDirectorySummary[];

  return {
    data: buildCareDirectoryEntries(profiles, careRows, options),
    error: null,
  };
}

/**
 * Single covered-Shepherd care profile, keyed by the Shepherd's profile id.
 * Returns null when no care row exists yet (the page renders "needs first
 * contact"). admin_summary is never selected.
 */
export async function fetchOverShepherdCareProfileByShepherdId(
  client: ReadClient,
  shepherdProfileId: string
): Promise<ReadResult<OverShepherdCareProfile | null>> {
  const { data, error } = await client
    .from("shepherd_care_profiles")
    .select(OVER_SHEPHERD_CARE_PROFILE_COLUMNS.select)
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
export function fetchOverShepherdCareInteractions(
  client: ReadClient,
  careProfileId: string
): Promise<ReadResult<ShepherdCareInteractionsRow[]>> {
  // The interaction history carries no admin-only field, and an Over-Shepherd
  // is permitted to read broad care notes, so this is exactly the admin read
  // (same columns + ordering). Delegate rather than duplicate the query; row
  // scoping is enforced by the OS.3 coverage-scoped RLS on this path.
  return fetchShepherdCareInteractionsForAdmin(client, careProfileId);
}

// ---------------------------------------------------------------------------
// The reads seam (ADR 0015): this surface's fetchers in one map, bound with
// the "over_shepherd" label so read_unit slow/fail timing covers the surface
// like the 20 admin bindings do.
// ---------------------------------------------------------------------------

const OVER_SHEPHERD_FETCHERS = {
  fetchOverShepherdCareDirectory,
  fetchOverShepherdCareProfileByShepherdId,
  fetchOverShepherdCareInteractions,
  // The caller's own author-private notes/prayers about a covered Shepherd
  // (shared leaf fetchers; RLS returns the author's rows regardless of the
  // transparency toggle).
  fetchCareNotesForSubject,
  fetchPrayerRequestsForSubject,
};

export type OverShepherdReads = BoundReads<typeof OVER_SHEPHERD_FETCHERS>;

export function bindOverShepherdReads(client: ReadClient): OverShepherdReads {
  return bindReads(client, OVER_SHEPHERD_FETCHERS, "over_shepherd");
}
