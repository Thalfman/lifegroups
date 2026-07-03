import "server-only";

import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";
import { isUuid } from "@/lib/shared/uuid";
import { CARE_NOTE_COLUMNS, PRAYER_REQUEST_COLUMNS } from "./care-note-reads";
import {
  projectJoinRows,
  unwrapEmbed,
  wrapError,
  type EmbeddedToOne,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ADR 0023 — reads behind the admin "All Notes" feed. Sibling to
// care-note-reads.ts (per-subject reads); this module holds the CROSS-subject
// reads the aggregate view needs. RLS remains the boundary for content reads;
// the sealed-count read goes through the count-only SECURITY DEFINER RPC
// (admin_sealed_note_counts), which exposes presence numbers and nothing else.

// One row per gating leader who holds notes the CALLER cannot read: the
// per-kind counts of sealed care notes / prayer requests. Returned by the
// admin_sealed_note_counts RPC (20260701010000).
export interface SealedNoteCount {
  gating_profile_id: string;
  sealed_care_note_count: number;
  sealed_prayer_request_count: number;
}

function isSealedNoteCount(v: unknown): v is SealedNoteCount {
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    isUuid(r.gating_profile_id) &&
    typeof r.sealed_care_note_count === "number" &&
    typeof r.sealed_prayer_request_count === "number"
  );
}

// Per-gating-leader sealed-note counts for the calling admin. Errors are
// returned, not swallowed: a failed read must SUPPRESS the sealed-notes
// summary (the #479 no-false-zero rule), never render as "nothing sealed".
export async function fetchSealedNoteCounts(
  client: ReadClient
): Promise<ReadResult<SealedNoteCount[]>> {
  // The RPC is not in the generated DB types; cast through `never` exactly as
  // the other hand-pinned RPC calls do (lib/auth/leader-surface-flag.ts).
  const { data, error } = await client.rpc("admin_sealed_note_counts" as never);
  if (error)
    return { data: null, error: wrapError("fetchSealedNoteCounts", error) };
  const rows: unknown = data ?? [];
  if (!Array.isArray(rows) || !rows.every(isSealedNoteCount)) {
    return {
      data: null,
      error: wrapError(
        "fetchSealedNoteCounts",
        new Error("sealed-note count rows failed validation")
      ),
    };
  }
  return { data: rows, error: null };
}

// ——— Cross-subject content reads (RLS-scoped, capped) ————————————————————

// The feed renders the most recent N of each source rather than paginating;
// v1 keeps this deliberately simple (fast-follow if the ministry outgrows it).
const DEFAULT_FEED_LIMIT = 100;

// Every care note the CALLER may read, newest first, across all subjects.
// No subject filter on purpose: RLS scopes the rows to the viewer's own
// authored notes plus notes whose gating leader's transparency grant is on.
export async function fetchAllReadableCareNotes(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<CareNotesRow[]>> {
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS.select)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_FEED_LIMIT);
  if (error)
    return { data: null, error: wrapError("fetchAllReadableCareNotes", error) };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchAllReadablePrayerRequests(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<PrayerRequestsRow[]>> {
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS.select)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_FEED_LIMIT);
  if (error)
    return {
      data: null,
      error: wrapError("fetchAllReadablePrayerRequests", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// An Over-Shepherd broad note surfaced in the feed: the interaction row's note
// body plus the leader it is about. Broad notes are deliberately
// ladder-readable (LDR.1, ADR 0002 — transparent upward, unlike author-private
// care notes), so including `notes` here widens no boundary; the recent-updates
// feed's body exclusion was a UX choice, not a privacy gate (ADR 0023 records
// the distinction).
export interface BroadNoteFeedRow {
  id: string;
  interaction_at: string;
  created_at: string;
  notes: string;
  created_by_profile_id: string;
  shepherd_profile_id: string;
  shepherd_full_name: string;
}

// Mirrors SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS (shepherd-care-interaction-reads.ts)
// plus the `notes` body and the author column the feed attributes. Raw select
// string by necessity: columns<Row>() cannot express embed fragments.
const BROAD_NOTE_FEED_COLUMNS =
  "id, interaction_at, notes, created_by_profile_id, created_at, " +
  "care_profile:shepherd_care_profiles!shepherd_care_interactions_care_profile_id_fkey!inner ( " +
  "shepherd_profile_id, " +
  "shepherd:profiles!shepherd_care_profiles_shepherd_profile_id_fkey!inner ( id, full_name, status ) " +
  ")";

type BroadNoteJoinCareProfile = {
  shepherd_profile_id: string;
  shepherd: EmbeddedToOne<{ id: string; full_name: string }>;
};

type BroadNoteJoinRow = {
  id: string;
  interaction_at: string;
  notes: string | null;
  created_by_profile_id: string;
  created_at: string;
  care_profile: EmbeddedToOne<BroadNoteJoinCareProfile>;
};

// Admin-only broad-note feed read: `interaction_type = 'other'` rows (the
// over-shepherd broad-note write destination) with a non-empty body, joined to
// the leader they are about. The admin-only RLS on shepherd_care_interactions
// is the boundary; the active-shepherd filter prunes rows whose leader was
// deactivated (matching fetchRecentShepherdCareInteractionsForAdmin).
export async function fetchBroadNoteInteractionsForAdmin(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<BroadNoteFeedRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(BROAD_NOTE_FEED_COLUMNS)
    .eq("interaction_type", "other")
    .not("notes", "is", null)
    .eq("care_profile.shepherd.status", "active")
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_FEED_LIMIT);
  if (error)
    return {
      data: null,
      error: wrapError("fetchBroadNoteInteractionsForAdmin", error),
    };
  const out = projectJoinRows(
    (data ?? []) as unknown as BroadNoteJoinRow[],
    (r) => {
      const cp = unwrapEmbed(r.care_profile);
      if (cp === null) return null;
      const shepherd = unwrapEmbed(cp.shepherd);
      if (shepherd === null) return null;
      const body = (r.notes ?? "").trim();
      if (body.length === 0) return null;
      return {
        id: r.id,
        interaction_at: r.interaction_at,
        created_at: r.created_at,
        notes: body,
        created_by_profile_id: r.created_by_profile_id,
        shepherd_profile_id: cp.shepherd_profile_id,
        shepherd_full_name: shepherd.full_name,
      };
    }
  );
  return { data: out, error: null };
}

// ——— Author-name resolution ————————————————————————————————————————————

// id → full_name for the given profile ids (e.g. note authors who are
// over-shepherds or admins and so absent from the care directory). Precedent:
// the same projection in super-admin-console-reads.ts. Degrades to an empty
// map — a missing name renders as a fallback label, never blocks the feed.
export async function fetchProfileNamesByIds(
  client: ReadClient,
  ids: readonly string[]
): Promise<ReadResult<Map<string, string>>> {
  const unique = Array.from(new Set(ids.filter((id) => isUuid(id))));
  if (unique.length === 0) return { data: new Map(), error: null };
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  if (error)
    return { data: null, error: wrapError("fetchProfileNamesByIds", error) };
  const out = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; full_name: string }[]) {
    out.set(row.id, row.full_name);
  }
  return { data: out, error: null };
}
