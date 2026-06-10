import { isUuid } from "@/lib/shared/uuid";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

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
