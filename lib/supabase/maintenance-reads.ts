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

// The history tables Clean Slate clears, in display order (parents first reads
// naturally for a human; the wipe order itself is enforced in the RPC).
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
