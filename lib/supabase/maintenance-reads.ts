// Danger-Zone maintenance read models (PRD-SAC6): the impact previews the
// Super Admin Console shows before a destructive action runs.
//
//   * fetchCleanSlateImpact — per-table row counts for the history tables the
//     Clean Slate wipe (#288) would clear, so the operator sees exactly what is
//     about to go.
//   * fetchAuditEventCount — the current audit_events row count, shown on the
//     standalone audit-log reset card (#290).
//
// Head-only count queries keep these cheap. All reads run under the caller's
// (super-admin) session, so RLS still applies.

import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import type { CleanSlateSnapshotsRow } from "@/types/database";

// The history tables Clean Slate clears, in display order (parents first reads
// naturally for a human). This is for the read-only impact preview only — it is
// NOT a deletion order. The FK-safe children → parents wipe order lives solely
// in the super_admin_clean_slate_wipe RPC; never drive a DELETE loop from this.
export const CLEAN_SLATE_TABLES = [
  "attendance_sessions",
  "attendance_records",
  "guests",
  "follow_ups",
  "group_health_assessments",
  "group_health_updates",
  "group_status_history",
  "church_attendance_snapshots",
  "shepherd_care_interactions",
  "shepherd_care_follow_ups",
] as const;

export type CleanSlateTable = (typeof CLEAN_SLATE_TABLES)[number];

export type CleanSlateImpact = {
  counts: Record<CleanSlateTable, number>;
  total: number;
};

// PRD-SAC6 (#293/#294): the latest un-restored snapshot, surfaced on the card so
// the operator can see what a revert/export would act on and so the Revert
// control + Export link can target a concrete id. The store holds at most one
// snapshot, and a revert stamps restored_at, so "latest un-restored" is the
// single recoverable one (null once it's been restored or never captured).
export type CleanSlateLatestSnapshot = {
  id: string;
  createdAt: string;
  totalRows: number;
  rowCounts: Record<string, number>;
};

// Coerce a jsonb row_counts value (Record<string, number-ish>) into a clean
// Record<string, number>, dropping non-finite entries. Shared by the snapshot
// read here and the wipe/revert success summaries in clean-slate-actions.ts so
// the card and the action agree on counts.
export function coerceRowCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function fetchLatestCleanSlateSnapshot(
  client: ReadClient
): Promise<ReadResult<CleanSlateLatestSnapshot | null>> {
  const { data, error } = await client
    .from("clean_slate_snapshots")
    .select("id, created_at, total_rows, row_counts")
    .is("restored_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<
        CleanSlateSnapshotsRow,
        "id" | "created_at" | "total_rows" | "row_counts"
      >
    >();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLatestCleanSlateSnapshot", error),
    };
  if (!data) return { data: null, error: null };

  const total = Number(data.total_rows);
  return {
    data: {
      id: String(data.id),
      createdAt: String(data.created_at),
      totalRows: Number.isFinite(total) ? total : 0,
      rowCounts: coerceRowCounts(data.row_counts),
    },
    error: null,
  };
}

async function countTable(
  client: ReadClient,
  table: CleanSlateTable
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function fetchCleanSlateImpact(
  client: ReadClient
): Promise<ReadResult<CleanSlateImpact>> {
  try {
    const counts = {} as Record<CleanSlateTable, number>;
    const results = await Promise.all(
      CLEAN_SLATE_TABLES.map((t) => countTable(client, t))
    );
    let total = 0;
    CLEAN_SLATE_TABLES.forEach((t, i) => {
      counts[t] = results[i];
      total += results[i];
    });
    return { data: { counts, total }, error: null };
  } catch (error) {
    return { data: null, error: wrapError("fetchCleanSlateImpact", error) };
  }
}

export async function fetchAuditEventCount(
  client: ReadClient
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("audit_events")
    .select("id", { count: "exact", head: true });
  if (error)
    return { data: null, error: wrapError("fetchAuditEventCount", error) };
  return { data: count ?? 0, error: null };
}
