import type {
  OverShepherdsRow,
  ProfilesRow,
  ShepherdCareFollowUpsRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
  ShepherdCoverageAssignmentsRow,
} from "@/types/database";
import { pgHexToBase64 } from "@/lib/crypto/encoding";
import {
  BUILT_IN_CARE_CADENCE_WINDOWS,
  coverageTierForShepherd,
  staleWindowDaysForTier,
  type CareCadenceWindows,
} from "@/lib/admin/shepherd-care-cadence";
import {
  detectCareReasons,
  needsAttentionFromReasons,
} from "@/lib/admin/shepherd-care-attention";
import {
  currentUtcDateIso,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker (admin-only) read models.
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_profiles. Used by every
 * shepherd-care reader so `select("*")` never leaks here. The table-level
 * RLS already restricts SELECT to super_admin / ministry_admin;
 * this allowlist is the defensive belt-and-braces.
 *
 * admin_summary is NOT a column here any more — phase_os5 moved it to the
 * fenced, admin-only shepherd_care_admin_notes table so RLS (not just the app
 * allowlist) keeps it off the over_shepherd coverage path. The admin
 * single-profile read re-attaches it from that table; see
 * `fetchShepherdCareProfileByShepherdId`.
 *
 * If you add a column, also extend `ShepherdCareProfilesRow` in
 * types/database.ts.
 */
export const SHEPHERD_CARE_PROFILE_COLUMNS =
  "id, shepherd_profile_id, current_status, last_contact_at, " +
  "next_touchpoint_due, archived_at, created_at, updated_at";

/**
 * Admin-only column allowlist for shepherd_care_interactions. Same
 * privacy posture as the profile constant above — never used outside an
 * admin code path.
 */
export const SHEPHERD_CARE_INTERACTION_COLUMNS =
  "id, care_profile_id, interaction_at, interaction_type, notes, " +
  "created_by_profile_id, created_at";

/**
 * Phase SC.4 private care notes. Creator-scoped column allowlists; never
 * select("*"). The body column is opaque AES-256-GCM ciphertext — the server
 * never holds plaintext or the key. Both readers run behind requireAdmin() and
 * filter on created_by_profile_id (belt-and-braces with the creator-scoped RLS
 * that excludes super_admin). No leader / co_leader / over_shepherd /
 * super_admin read path exists.
 */
export const SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS =
  "id, care_profile_id, created_by_profile_id, ciphertext, iv, dek_version, " +
  "created_at, updated_at";

export const SHEPHERD_CARE_KEY_SLOT_COLUMNS =
  "id, created_by_profile_id, dek_version, slot_type, credential_id, label, " +
  "prf_salt, hkdf_salt, wrapped_dek, wrap_iv, created_at";

// Read-shape DTOs. The bytea columns arrive from PostgREST in hex output and
// are normalised to base64 here so the whole app/client layer speaks one
// encoding (see lib/crypto/encoding.ts).
export type PrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string; // base64
  iv: string; // base64
  dek_version: number;
  created_at: string;
  updated_at: string;
};

export type PrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null; // base64
  label: string | null;
  prf_salt: string | null; // base64
  hkdf_salt: string; // base64
  wrapped_dek: string; // base64
  wrap_iv: string; // base64
  created_at: string;
};

// PostgREST default bytea output is hex ("\\x..."); some deployments emit
// base64. Normalise hex to base64 and pass an already-base64 value through.
function byteaToBase64(value: string): string {
  return value.startsWith("\\x") || value.startsWith("\\X")
    ? pgHexToBase64(value)
    : value;
}

function nullableByteaToBase64(value: string | null): string | null {
  return value === null || value === undefined ? null : byteaToBase64(value);
}

/**
 * Conservative days-since-last-contact fallback for the "needs attention"
 * filter when no per-tier window is supplied. Julian Q5 replaced the former
 * single window with two tier-keyed windows (see lib/admin/shepherd-care-cadence
 * and app_settings.metric_defaults.shepherd_care_stale_days_{direct,delegated}).
 * This equals the longer (delegated) default so a caller without coverage
 * context never over-flags.
 */
export const SHEPHERD_CARE_STALE_DAYS =
  BUILT_IN_CARE_CADENCE_WINDOWS.delegatedStaleDays;

// Directory cards never render the admin_summary, so omit it from the
// projected care row to keep the response payload small and avoid
// shipping note bodies anywhere the directory is rendered.
export type ShepherdCareDirectorySummary = Pick<
  ShepherdCareProfilesRow,
  | "id"
  | "shepherd_profile_id"
  | "current_status"
  | "last_contact_at"
  | "next_touchpoint_due"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

// Exported so the coverage-scoped Over-Shepherd reader projects the exact same
// (admin_summary-free) care columns from one source of truth, rather than
// maintaining a byte-identical copy.
export const SHEPHERD_CARE_DIRECTORY_COLUMNS =
  "id, shepherd_profile_id, current_status, last_contact_at, " +
  "next_touchpoint_due, archived_at, created_at, updated_at";

export type ShepherdCareDirectoryEntry = {
  profile: Pick<ProfilesRow, "id" | "full_name" | "email" | "role" | "status">;
  care: ShepherdCareDirectorySummary | null;
  needs_attention: boolean;
};

/**
 * Join a set of directory profiles with their care rows in TS (so a profile
 * with no care row still appears as "needs first contact") and stamp each
 * entry's needs_attention. Shared by the admin directory and the coverage-
 * scoped Over-Shepherd directory so the assembly + needs_attention wiring
 * lives in one place. Both callers pre-scope which profiles/care rows they
 * read; this only assembles.
 *
 * Julian Q5: needs_attention now uses the per-tier staleness window. A
 * shepherd in `delegatedShepherdIds` (an active over-shepherd assignment) is
 * delegated (longer window); otherwise directly-overseen (shorter window).
 * Omitting `delegatedShepherdIds` treats every shepherd as delegated — the
 * conservative longer window — which is exactly right for the Over-Shepherd
 * surface (every covered shepherd is delegated by definition) and avoids
 * over-flagging when coverage context is unavailable.
 */
export function buildCareDirectoryEntries(
  profiles: Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[],
  careRows: ShepherdCareDirectorySummary[],
  options: {
    todayIso?: string;
    windows?: CareCadenceWindows;
    delegatedShepherdIds?: ReadonlySet<string>;
  } = {}
): ShepherdCareDirectoryEntry[] {
  const careByShepherdId = new Map<string, ShepherdCareDirectorySummary>();
  for (const row of careRows)
    careByShepherdId.set(row.shepherd_profile_id, row);

  const today = options.todayIso ?? currentUtcDateIso();
  const windows = options.windows ?? BUILT_IN_CARE_CADENCE_WINDOWS;
  const delegatedShepherdIds = options.delegatedShepherdIds;

  return profiles.map((profile) => {
    const care = careByShepherdId.get(profile.id) ?? null;
    const hasActiveOverShepherd = delegatedShepherdIds
      ? delegatedShepherdIds.has(profile.id)
      : true;
    const staleDays = staleWindowDaysForTier(
      coverageTierForShepherd(hasActiveOverShepherd),
      windows
    );
    return {
      profile,
      care,
      needs_attention: computeNeedsAttention(care, today, staleDays),
    };
  });
}

// The directory chip + filter boolean. Derived from the shared reason engine
// so it is exactly the chip-worthy subset of the triage queue's reasons and
// can never disagree with it (lib/admin/shepherd-care-attention.ts). The read
// path has no follow-up feed or coverage context, so overdue_care_follow_up
// and no_over_shepherd never arise here; needs_encouragement / inactive are
// (deliberately) not chip reasons.
export function computeNeedsAttention(
  care: ShepherdCareDirectorySummary | null,
  todayIso: string,
  staleDays: number = SHEPHERD_CARE_STALE_DAYS
): boolean {
  return needsAttentionFromReasons(
    detectCareReasons(care, { todayIso, staleDays })
  );
}

/**
 * Admin-only directory of leader / co_leader profiles joined with the
 * matching shepherd_care_profiles row (or null when no care row exists
 * yet). The join is computed in TS so leaders with no care row still
 * appear in the directory as "needs first contact".
 */
export async function fetchShepherdCareDirectoryForAdmin(
  client: ReadClient,
  options: {
    todayIso?: string;
    windows?: CareCadenceWindows;
    // Julian Q5: the shepherds with an active over-shepherd assignment (the
    // delegated tier, longer window); anyone else is directly-overseen
    // (shorter window). The caller passes the SAME active-coverage set the
    // dashboard uses, so the directory's needs_attention can never disagree
    // with the queue. Omitted => every shepherd is treated as delegated (the
    // conservative longer window), which is also exactly right for callers
    // where every shepherd is delegated by definition.
    delegatedShepherdIds?: ReadonlySet<string>;
  } = {}
): Promise<ReadResult<ShepherdCareDirectoryEntry[]>> {
  const profilesQuery = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .in("role", ["leader", "co_leader"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (profilesQuery.error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCareDirectoryForAdmin/profiles",
        profilesQuery.error
      ),
    };
  }

  const shepherdIds = (profilesQuery.data ?? []).map(
    (p) => (p as { id: string }).id
  );

  // Filter care rows down to the visible shepherd ids so the response
  // doesn't ship every care row in the database to the directory page.
  // Skipping the fetch entirely when there are no shepherd ids keeps
  // the PostgREST `.in("col", [])` edge case off the wire.
  let careRows: ShepherdCareDirectorySummary[] = [];
  if (shepherdIds.length > 0) {
    const careQuery = await client
      .from("shepherd_care_profiles")
      .select(SHEPHERD_CARE_DIRECTORY_COLUMNS)
      .in("shepherd_profile_id", shepherdIds);
    if (careQuery.error) {
      return {
        data: null,
        error: wrapError(
          "fetchShepherdCareDirectoryForAdmin/care",
          careQuery.error
        ),
      };
    }
    careRows = (careQuery.data ?? []) as ShepherdCareDirectorySummary[];
  }

  const profiles = (profilesQuery.data ?? []) as Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[];

  return {
    data: buildCareDirectoryEntries(profiles, careRows, {
      todayIso: options.todayIso,
      windows: options.windows,
      delegatedShepherdIds: options.delegatedShepherdIds,
    }),
    error: null,
  };
}

/**
 * Admin-only single-profile read keyed by the LEADER's profile id (not
 * the care_profile row id). Returns null when no care row exists yet —
 * the caller renders the page in "needs first contact" state.
 */
export async function fetchShepherdCareProfileByShepherdId(
  client: ReadClient,
  shepherdProfileId: string
): Promise<ReadResult<ShepherdCareProfilesRow | null>> {
  const { data, error } = await client
    .from("shepherd_care_profiles")
    .select(SHEPHERD_CARE_PROFILE_COLUMNS)
    .eq("shepherd_profile_id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareProfileByShepherdId", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };

  // admin_summary now lives in the fenced, admin-only shepherd_care_admin_notes
  // table (phase_os5). Re-attach it here for the admin detail surface; this
  // read only runs behind requireAdmin(), and the notes table's admin-only RLS
  // keeps it off any non-admin path even if this read is reused.
  const base = data as Omit<ShepherdCareProfilesRow, "admin_summary">;
  const note = await client
    .from("shepherd_care_admin_notes")
    .select("admin_summary")
    .eq("care_profile_id", base.id)
    .maybeSingle();
  if (note.error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCareProfileByShepherdId/admin_notes",
        note.error
      ),
    };
  }
  const admin_summary =
    (note.data as { admin_summary?: string | null } | null)?.admin_summary ??
    null;
  return { data: { ...base, admin_summary }, error: null };
}

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
    .select(SHEPHERD_CARE_INTERACTION_COLUMNS)
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

// ---------------------------------------------------------------------------
// Phase SC.1B — Shepherd care follow-ups (admin-only task list) read models.
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_follow_ups. Same privacy
 * posture as the SC.1A care constants above — never used outside an admin
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
  "id, care_profile_id, title, due_date, status, notes, " +
  "created_by_profile_id, created_at, updated_at, completed_at";

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
    .select(SHEPHERD_CARE_FOLLOW_UP_COLUMNS)
    .eq("care_profile_id", careProfileId)
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
  care_profile_id: string;
  status: ShepherdCareFollowUpsRow["status"];
  due_date: string | null;
};

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
    .select("care_profile_id, status, due_date")
    .neq("status", "done")
    .range(0, 9999);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOutstandingCareFollowUpsForAdmin", error),
    };
  }
  return { data: (data ?? []) as CareFollowUpDashboardRow[], error: null };
}

// A leader's active group(s), for the leader-detail Group tab + Overview's
// "assigned group" line (#301). Name + id only; the detail page links into the
// group's own surface for the rest.
export type LedGroupSummary = { id: string; name: string };

/**
 * The active groups a leader / co-leader leads, resolved from their active
 * group_leaders rows. Two cheap scoped reads (assignments, then names) rather
 * than a relational embed, to keep the projection explicit. Returns [] when the
 * leader leads nothing.
 */
export async function fetchLedGroupSummariesForProfile(
  client: ReadClient,
  profileId: string
): Promise<ReadResult<LedGroupSummary[]>> {
  const assignments = await client
    .from("group_leaders")
    .select("group_id")
    .eq("profile_id", profileId)
    .eq("active", true);
  if (assignments.error) {
    return {
      data: null,
      error: wrapError(
        "fetchLedGroupSummariesForProfile/assignments",
        assignments.error
      ),
    };
  }
  const groupIds = Array.from(
    new Set(
      ((assignments.data ?? []) as { group_id: string }[]).map(
        (r) => r.group_id
      )
    )
  );
  if (groupIds.length === 0) return { data: [], error: null };

  const groups = await client
    .from("groups")
    .select("id, name")
    .in("id", groupIds)
    .order("name", { ascending: true });
  if (groups.error) {
    return {
      data: null,
      error: wrapError("fetchLedGroupSummariesForProfile/groups", groups.error),
    };
  }
  return { data: (groups.data ?? []) as LedGroupSummary[], error: null };
}

// Minimal cross-profile projection for the Care area's Completed tab (#301).
// Like CareFollowUpDashboardRow it EXCLUDES title / notes bodies — the
// Completed list shows who, when, and a "View follow-up" link into the
// per-leader detail page for the task content; it never ships note bodies to
// the aggregate surface.
export type CareFollowUpCompletedRow = {
  care_profile_id: string;
  status: ShepherdCareFollowUpsRow["status"];
  due_date: string | null;
  completed_at: string | null;
};

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
    .select("care_profile_id, status, due_date, completed_at")
    .eq("status", "done")
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

function projectRecentInteractionRows(
  rows: unknown[]
): ShepherdCareRecentInteractionRow[] {
  const out: ShepherdCareRecentInteractionRow[] = [];
  for (const r of rows as Array<{
    id: string;
    care_profile_id: string;
    interaction_at: string;
    interaction_type: ShepherdCareInteractionsRow["interaction_type"];
    created_at: string;
    care_profile:
      | {
          shepherd_profile_id: string;
          shepherd:
            | { id: string; full_name: string }
            | { id: string; full_name: string }[]
            | null;
        }
      | {
          shepherd_profile_id: string;
          shepherd:
            | { id: string; full_name: string }
            | { id: string; full_name: string }[]
            | null;
        }[]
      | null;
  }>) {
    const cp = Array.isArray(r.care_profile)
      ? (r.care_profile[0] ?? null)
      : r.care_profile;
    if (cp === null) continue;
    const shepherd = Array.isArray(cp.shepherd)
      ? (cp.shepherd[0] ?? null)
      : cp.shepherd;
    if (shepherd === null) continue;
    out.push({
      id: r.id,
      care_profile_id: r.care_profile_id,
      interaction_at: r.interaction_at,
      interaction_type: r.interaction_type,
      created_at: r.created_at,
      shepherd_profile_id: cp.shepherd_profile_id,
      shepherd_full_name: shepherd.full_name,
    });
  }
  return out;
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
    .in(
      "care_profile.shepherd.role",
      ELIGIBLE_SHEPHERD_ROLES as unknown as string[]
    )
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

/**
 * Single-profile lookup by leader profile id, used by the detail page to
 * resolve the leader's profile and validate role gating. Admin-only.
 */
export async function fetchAdminShepherdProfileById(
  client: ReadClient,
  shepherdProfileId: string
): Promise<
  ReadResult<Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  > | null>
> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchAdminShepherdProfileById", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  return {
    data: data as Pick<
      ProfilesRow,
      "id" | "full_name" | "email" | "role" | "status"
    >,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking (SC.2).
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for over_shepherds list reads. EXCLUDES
 * `notes` — directory and summary cards never render note bodies, so
 * the column doesn't leave the server. Use OVER_SHEPHERD_DETAIL_COLUMNS
 * when loading a single record for the edit form.
 */
export const OVER_SHEPHERD_LIST_COLUMNS =
  "id, full_name, email, phone, active, archived_at, created_at, updated_at";

/**
 * Admin-only column allowlist that INCLUDES `notes`. Used only by the
 * over-shepherd edit form's loader.
 */
export const OVER_SHEPHERD_DETAIL_COLUMNS = `${OVER_SHEPHERD_LIST_COLUMNS}, notes`;

export const SHEPHERD_COVERAGE_ASSIGNMENT_COLUMNS =
  "id, shepherd_profile_id, over_shepherd_id, active, assigned_at, ended_at, created_at, updated_at";

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
    .select(OVER_SHEPHERD_LIST_COLUMNS)
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
    .select(OVER_SHEPHERD_DETAIL_COLUMNS)
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
    const embedded = Array.isArray(r.over_shepherd)
      ? (r.over_shepherd[0] ?? null)
      : r.over_shepherd;
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
// don't, so this read-side filter is the belt-and-braces.
const ELIGIBLE_SHEPHERD_ROLES = ["leader", "co_leader"] as const;

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
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES as unknown as string[]);
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
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES as unknown as string[]);
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
    const embedded = Array.isArray(r.shepherd)
      ? (r.shepherd[0] ?? null)
      : r.shepherd;
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

// ----- Phase SC.4 — private care note readers -----------------------------

type RawPrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string;
  iv: string;
  dek_version: number;
  created_at: string;
  updated_at: string;
};

type RawPrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null;
  label: string | null;
  prf_salt: string | null;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
  created_at: string;
};

/**
 * The calling admin's own private-note ciphertext for one care profile. Behind
 * requireAdmin(); creator-scoped RLS additionally guarantees a caller can only
 * read their own row. Returns ciphertext + iv normalised to base64.
 */
export async function fetchShepherdCarePrivateNoteCiphertextForCreator(
  client: ReadClient,
  careProfileId: string,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteCiphertext | null>> {
  const { data, error } = await client
    .from("shepherd_care_private_notes")
    .select(SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS)
    .eq("care_profile_id", careProfileId)
    .eq("created_by_profile_id", creatorProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCarePrivateNoteCiphertextForCreator",
        error
      ),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  const row = data as RawPrivateNoteCiphertext;
  return {
    data: {
      id: row.id,
      care_profile_id: row.care_profile_id,
      created_by_profile_id: row.created_by_profile_id,
      ciphertext: byteaToBase64(row.ciphertext),
      iv: byteaToBase64(row.iv),
      dek_version: row.dek_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    error: null,
  };
}

/**
 * The calling admin's own wrapped-DEK key slots. Behind requireAdmin();
 * creator-scoped RLS additionally fences the slot table. Bytea fields
 * normalised to base64; recovery slots keep credential_id / prf_salt null.
 */
export async function fetchPrivateNoteKeySlotsForCreator(
  client: ReadClient,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteKeySlot[]>> {
  const { data, error } = await client
    .from("shepherd_care_note_key_slots")
    .select(SHEPHERD_CARE_KEY_SLOT_COLUMNS)
    .eq("created_by_profile_id", creatorProfileId)
    .order("created_at", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchPrivateNoteKeySlotsForCreator", error),
    };
  }
  const rows = (data ?? []) as RawPrivateNoteKeySlot[];
  return {
    data: rows.map((row) => ({
      id: row.id,
      created_by_profile_id: row.created_by_profile_id,
      dek_version: row.dek_version,
      slot_type: row.slot_type,
      credential_id: nullableByteaToBase64(row.credential_id),
      label: row.label,
      prf_salt: nullableByteaToBase64(row.prf_salt),
      hkdf_salt: byteaToBase64(row.hkdf_salt),
      wrapped_dek: byteaToBase64(row.wrapped_dek),
      wrap_iv: byteaToBase64(row.wrap_iv),
      created_at: row.created_at,
    })),
    error: null,
  };
}
