// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type { ProfilesRow, ShepherdCareProfilesRow } from "@/types/database";
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
  resolveAttentionBaseline,
  type AttentionBaselines,
} from "@/lib/admin/attention-reset";
import {
  columns,
  currentUtcDateIso,
  fetchByIds,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker (admin-only) directory read models.
// One sub-domain of the former shepherd-care-reads module; its siblings are
// shepherd-care-interaction-reads, shepherd-care-follow-up-reads,
// shepherd-coverage-reads, and shepherd-care-private-note-reads.
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
export const SHEPHERD_CARE_PROFILE_COLUMNS = columns<ShepherdCareProfilesRow>()(
  "id",
  "shepherd_profile_id",
  "current_status",
  "last_contact_at",
  "next_touchpoint_due",
  "archived_at",
  "created_at",
  "updated_at"
);

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
  columns<ShepherdCareDirectorySummary>()(
    "id",
    "shepherd_profile_id",
    "current_status",
    "last_contact_at",
    "next_touchpoint_due",
    "archived_at",
    "created_at",
    "updated_at"
  );

export type ShepherdCareDirectoryEntry = {
  profile: Pick<ProfilesRow, "id" | "full_name" | "email" | "role" | "status">;
  care: ShepherdCareDirectorySummary | null;
  needs_attention: boolean;
};

// The raw rows the directory is assembled from: the active leader/co_leader
// profiles and their care rows, BEFORE the pure needs_attention stamping. Split
// out so callers that already compute the stamping inputs (windows / delegated
// set / baselines) on their own request can fetch these rows in their main read
// batch and stamp in memory afterwards — the two DB reads here depend on none of
// those inputs (only buildCareDirectoryEntries does). See
// fetchShepherdCareDirectoryRowsForAdmin / buildCareDirectoryEntries.
export type ShepherdCareDirectoryRaw = {
  profiles: Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[];
  careRows: ShepherdCareDirectorySummary[];
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
    // health-checks-reset: the care reset baselines, so a freshly-reset leader
    // reads fresh (the chip drops) without deleting their contact history.
    baselines?: AttentionBaselines;
  } = {}
): ShepherdCareDirectoryEntry[] {
  const careByShepherdId = new Map<string, ShepherdCareDirectorySummary>();
  for (const row of careRows)
    careByShepherdId.set(row.shepherd_profile_id, row);

  const today = options.todayIso ?? currentUtcDateIso();
  const windows = options.windows ?? BUILT_IN_CARE_CADENCE_WINDOWS;
  const delegatedShepherdIds = options.delegatedShepherdIds;
  const baselines = options.baselines;

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
      needs_attention: computeNeedsAttention(
        care,
        today,
        staleDays,
        resolveAttentionBaseline(baselines, profile.id)
      ),
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
  staleDays: number = SHEPHERD_CARE_STALE_DAYS,
  baselineIso: string | null = null
): boolean {
  return needsAttentionFromReasons(
    detectCareReasons(care, { todayIso, staleDays, baselineIso })
  );
}

// The shepherd-identity projection of a profiles row: what the directory embed
// read and the single-shepherd lookup both need. Shared so the two select
// strings cannot drift apart.
const SHEPHERD_CARE_SHEPHERD_PROFILE_COLUMNS = columns<
  Pick<ProfilesRow, "id" | "full_name" | "email" | "role" | "status">
>()("id", "full_name", "email", "role", "status");

/**
 * Admin-only directory of leader / co_leader profiles joined with the
 * matching shepherd_care_profiles row (or null when no care row exists
 * yet). The join is computed in TS so leaders with no care row still
 * appear in the directory as "needs first contact".
 */
// The two raw DB reads behind the admin directory: active leader/co_leader
// profiles, then their care rows (scoped to those shepherd ids). Returns the raw
// rows so a caller can stamp needs_attention itself. Neither read depends on the
// stamping inputs, so this can ride a caller's main parallel read batch.
export async function fetchShepherdCareDirectoryRowsForAdmin(
  client: ReadClient
): Promise<ReadResult<ShepherdCareDirectoryRaw>> {
  // Active leader/co_leader profiles with their care row embedded, in ONE round
  // trip. This used to be two SERIAL queries (profiles, then their care rows
  // filtered by the resulting ids) — the only entry on the /admin Home batch that
  // cost two round trips, so it dominated that batch's critical path. A single
  // PostgREST embedded read collapses it to one round trip AND keeps the
  // shepherd-id scoping in the DATABASE (bounded to the active leaders by the
  // parent filter), so — unlike a fetch-all-then-filter-in-TS — it can't drop a
  // matching shepherd's care row to an un-ranged row cap. The embed traverses the
  // shepherd_care_profiles.shepherd_profile_id -> profiles.id FK.
  const { data, error } = await client
    .from("profiles")
    .select(
      `${SHEPHERD_CARE_SHEPHERD_PROFILE_COLUMNS.select}, shepherd_care_profiles(${SHEPHERD_CARE_DIRECTORY_COLUMNS.select})`
    )
    .in("role", ["leader", "co_leader"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareDirectoryForAdmin", error),
    };
  }

  // Flatten the embedded rows back into the { profiles, careRows } contract
  // buildCareDirectoryEntries consumes. Each shepherd has 0 or 1 care row, so the
  // embedded array carries at most one element.
  type EmbeddedRow = Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  > & { shepherd_care_profiles: ShepherdCareDirectorySummary[] };
  const rows = (data ?? []) as unknown as EmbeddedRow[];
  const profiles = rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
  }));
  const careRows = rows.flatMap((row) => row.shepherd_care_profiles ?? []);

  return { data: { profiles, careRows }, error: null };
}

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
    // health-checks-reset: care reset baselines, threaded into needs_attention.
    baselines?: AttentionBaselines;
  } = {}
): Promise<ReadResult<ShepherdCareDirectoryEntry[]>> {
  const raw = await fetchShepherdCareDirectoryRowsForAdmin(client);
  if (raw.error) return { data: null, error: raw.error };

  return {
    data: buildCareDirectoryEntries(raw.data.profiles, raw.data.careRows, {
      todayIso: options.todayIso,
      windows: options.windows,
      delegatedShepherdIds: options.delegatedShepherdIds,
      baselines: options.baselines,
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
    .select(SHEPHERD_CARE_PROFILE_COLUMNS.select)
    .eq("shepherd_profile_id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareProfileByShepherdId", error),
    };
  }
  if (data == null) return { data: null, error: null };

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
    .eq("active", true)
    // group_leaders also carries member rows (role = 'member'); only the
    // leader / co_leader assignments describe groups this profile *leads*, so
    // the Group tab + related-group labels don't show a group they're only a
    // member of.
    .in("role", ["leader", "co_leader"]);
  if (assignments.error) {
    return {
      data: null,
      error: wrapError(
        "fetchLedGroupSummariesForProfile/assignments",
        assignments.error
      ),
    };
  }
  const groupIds = ((assignments.data ?? []) as { group_id: string }[]).map(
    (r) => r.group_id
  );
  // fetchByIds owns the id dedup + empty short-circuit; the refinement adds the
  // active-only filter and the name ordering this summary needs. Closing a
  // group sets groups.lifecycle_status but leaves its group_leaders rows active,
  // so excluding non-active groups here keeps the Group / Overview tabs from
  // showing (and linking to) a closed group as a current one.
  return fetchByIds<LedGroupSummary>(client, "groups", groupIds, "id, name", {
    label: "fetchLedGroupSummariesForProfile/groups",
    refine: (q) =>
      q.eq("lifecycle_status", "active").order("name", { ascending: true }),
  });
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
    .select(SHEPHERD_CARE_SHEPHERD_PROFILE_COLUMNS.select)
    .eq("id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchAdminShepherdProfileById", error),
    };
  }
  if (data == null) return { data: null, error: null };
  return {
    data: data as Pick<
      ProfilesRow,
      "id" | "full_name" | "email" | "role" | "status"
    >,
    error: null,
  };
}
