import "server-only";

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

import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";
import type {
  ActivityResetBaselinesRow,
  AttentionResetBaselinesRow,
  AttentionResetSnapshotsRow,
  CleanSlateSnapshotsRow,
  HistoryResetSnapshotsRow,
} from "@/types/database";
import {
  ATTENTION_RESET_SURFACES,
  type AttentionResetSurface,
} from "@/lib/admin/attention-reset";
import {
  HISTORY_RESET_CATEGORIES,
  HISTORY_RESET_CATEGORY_KEYS,
  HISTORY_RESET_TABLES,
  isHistoryResetCategory,
  type HistoryResetCategory,
} from "@/lib/admin/history-reset";

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

const SUPER_ADMIN_CLEAN_SLATE_SNAPSHOT_COLUMNS = columns<
  Pick<
    CleanSlateSnapshotsRow,
    "id" | "created_at" | "total_rows" | "row_counts"
  >
>()("id", "created_at", "total_rows", "row_counts");

export async function fetchLatestCleanSlateSnapshot(
  client: ReadClient
): Promise<ReadResult<CleanSlateLatestSnapshot | null>> {
  const { data, error } = await client
    .from("clean_slate_snapshots")
    .select(SUPER_ADMIN_CLEAN_SLATE_SNAPSHOT_COLUMNS.select)
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
  // head:true returns no rows, but name the column anyway so the column
  // allowlist discipline holds even here (every clean-slate table has `id`).
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true });
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

// PRD-SAC6 follow-up: the per-category history-reset card state. For each
// category: the current total row count across its tables (the impact preview)
// and the latest un-restored snapshot it could revert from, if any.
export type HistoryResetSnapshotSummary = {
  id: string;
  createdAt: string;
  totalRows: number;
};

export type HistoryResetCategoryState = {
  category: HistoryResetCategory;
  count: number;
  snapshot: HistoryResetSnapshotSummary | null;
};

export type HistoryResetState = {
  categories: HistoryResetCategoryState[];
};

// Reduce the un-restored snapshot rows (ordered newest first) to the single
// latest one per category. The store already keeps at most one un-restored
// snapshot per category, but this stays correct even if that ever loosens.
function latestSnapshotByCategory(
  rows: Pick<
    HistoryResetSnapshotsRow,
    "id" | "created_at" | "total_rows" | "category"
  >[]
): Map<HistoryResetCategory, HistoryResetSnapshotSummary> {
  const out = new Map<HistoryResetCategory, HistoryResetSnapshotSummary>();
  for (const row of rows) {
    if (!isHistoryResetCategory(row.category) || out.has(row.category))
      continue;
    const total = Number(row.total_rows);
    out.set(row.category, {
      id: String(row.id),
      createdAt: String(row.created_at),
      totalRows: Number.isFinite(total) ? total : 0,
    });
  }
  return out;
}

const SUPER_ADMIN_HISTORY_RESET_SNAPSHOT_COLUMNS = columns<
  Pick<
    HistoryResetSnapshotsRow,
    "id" | "created_at" | "total_rows" | "category"
  >
>()("id", "created_at", "total_rows", "category");

export async function fetchHistoryResetState(
  client: ReadClient
): Promise<ReadResult<HistoryResetState>> {
  try {
    // Per-table head counts (each history table counted once), in parallel.
    const tables = HISTORY_RESET_TABLES;
    const counts = await Promise.all(
      tables.map((t) => countTable(client, t as CleanSlateTable))
    );
    const countByTable = new Map<string, number>();
    tables.forEach((t, i) => countByTable.set(t, counts[i]));

    // Latest un-restored snapshot per category, in one read.
    const { data: snapshotRows, error: snapshotError } = await client
      .from("history_reset_snapshots")
      .select(SUPER_ADMIN_HISTORY_RESET_SNAPSHOT_COLUMNS.select)
      .is("restored_at", null)
      .order("created_at", { ascending: false });
    if (snapshotError) throw snapshotError;

    const snapshots = latestSnapshotByCategory(
      (snapshotRows ?? []) as Pick<
        HistoryResetSnapshotsRow,
        "id" | "created_at" | "total_rows" | "category"
      >[]
    );

    const categories: HistoryResetCategoryState[] =
      HISTORY_RESET_CATEGORY_KEYS.map((category) => {
        const count = HISTORY_RESET_CATEGORIES[category].reduce(
          (sum, table) => sum + (countByTable.get(table) ?? 0),
          0
        );
        return { category, count, snapshot: snapshots.get(category) ?? null };
      });

    return { data: { categories }, error: null };
  } catch (error) {
    return { data: null, error: wrapError("fetchHistoryResetState", error) };
  }
}

// health-checks-reset: the current attention-reset baselines, read on the admin
// dashboard path so the "Needs attention" derivations can honour a reset. RLS
// admits both admin roles to SELECT (the whole admin team's Home agrees). Used
// by the dashboard read; a failure degrades to "no baselines" (today's
// behaviour) rather than failing the page.
const SUPER_ADMIN_ATTENTION_RESET_BASELINE_COLUMNS =
  columns<AttentionResetBaselinesRow>()(
    "id",
    "surface",
    "scope",
    "entity_id",
    "baseline_on",
    "created_by",
    "created_at"
  );

export async function fetchAttentionResetBaselines(
  client: ReadClient
): Promise<ReadResult<AttentionResetBaselinesRow[]>> {
  const { data, error } = await client
    .from("attention_reset_baselines")
    .select(SUPER_ADMIN_ATTENTION_RESET_BASELINE_COLUMNS.select);
  if (error)
    return {
      data: null,
      error: wrapError("fetchAttentionResetBaselines", error),
    };
  return { data: (data ?? []) as AttentionResetBaselinesRow[], error: null };
}

// health-checks-reset: the per-surface reset card state for the Super Admin
// Console. For each surface: whether a global baseline is currently set (and
// when), the per-entity override count, the impact preview (how many entities a
// global reset would touch), and the latest un-restored snapshot it could
// revert from.
// A recoverable per-entity reset snapshot, surfaced so its revert is reachable
// from the console (the per-item reset advertises Danger-Zone undo).
export type AttentionResetEntitySnapshot = {
  id: string;
  entityId: string;
  createdAt: string;
};

export type AttentionResetSurfaceState = {
  surface: AttentionResetSurface;
  globalBaselineOn: string | null;
  entityOverrideCount: number;
  // The number of entities a global reset would touch — leader care profiles
  // for "care", active groups for "health". A cheap head count; the real proof
  // a reset worked is Home dropping to zero, not this preview.
  impactCount: number;
  // The active (un-restored, un-superseded) global reset snapshot, if any.
  snapshot: { id: string; createdAt: string } | null;
  // Active per-entity reset snapshots, so each single-leader/single-group reset
  // is revertable from the console (latest per entity, capped).
  entitySnapshots: AttentionResetEntitySnapshot[];
};

export type AttentionResetState = {
  surfaces: AttentionResetSurfaceState[];
};

const SUPER_ADMIN_ATTENTION_BASELINE_STATE_COLUMNS = columns<
  Pick<
    AttentionResetBaselinesRow,
    "surface" | "scope" | "entity_id" | "baseline_on"
  >
>()("surface", "scope", "entity_id", "baseline_on");

const SUPER_ADMIN_ATTENTION_RESET_SNAPSHOT_COLUMNS = columns<
  Pick<
    AttentionResetSnapshotsRow,
    "id" | "created_at" | "surface" | "scope" | "entity_id"
  >
>()("id", "created_at", "surface", "scope", "entity_id");

export async function fetchAttentionResetState(
  client: ReadClient
): Promise<ReadResult<AttentionResetState>> {
  try {
    const [baselinesRes, snapshotRows, careCount, groupCount] =
      await Promise.all([
        client
          .from("attention_reset_baselines")
          .select(SUPER_ADMIN_ATTENTION_BASELINE_STATE_COLUMNS.select),
        client
          .from("attention_reset_snapshots")
          .select(SUPER_ADMIN_ATTENTION_RESET_SNAPSHOT_COLUMNS.select)
          .is("restored_at", null)
          .is("superseded_at", null)
          .order("created_at", { ascending: false }),
        client
          .from("shepherd_care_profiles")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null),
        client
          .from("groups")
          .select("id", { count: "exact", head: true })
          .eq("lifecycle_status", "active"),
      ]);
    if (baselinesRes.error) throw baselinesRes.error;
    if (snapshotRows.error) throw snapshotRows.error;
    // A failed head-count must fail the read, not degrade to `count: null` —
    // `?? 0` below would otherwise render a false "this reset would touch 0
    // entities" preview on a destructive-action card.
    if (careCount.error) throw careCount.error;
    if (groupCount.error) throw groupCount.error;

    const baselines = (baselinesRes.data ?? []) as Pick<
      AttentionResetBaselinesRow,
      "surface" | "scope" | "entity_id" | "baseline_on"
    >[];
    const snapshots = (snapshotRows.data ?? []) as Pick<
      AttentionResetSnapshotsRow,
      "id" | "created_at" | "surface" | "scope" | "entity_id"
    >[];
    const impactBySurface: Record<AttentionResetSurface, number> = {
      care: careCount.count ?? 0,
      health: groupCount.count ?? 0,
    };
    // Cap the per-surface entity-snapshot list so the console stays bounded even
    // after many single resets; rows are newest-first from the query.
    const ENTITY_SNAPSHOT_CAP = 25;

    const surfaces: AttentionResetSurfaceState[] = ATTENTION_RESET_SURFACES.map(
      (surface) => {
        const rows = baselines.filter((b) => b.surface === surface);
        const globalRow = rows.find(
          (b) => b.scope === "global" && b.entity_id === null
        );
        const entityOverrideCount = rows.filter(
          (b) => b.scope === "entity"
        ).length;
        const surfaceSnapshots = snapshots.filter((s) => s.surface === surface);
        const globalSnapshot = surfaceSnapshots.find(
          (s) => s.scope === "global"
        );
        // Latest active snapshot per entity (rows are already newest-first).
        const seenEntities = new Set<string>();
        const entitySnapshots: AttentionResetEntitySnapshot[] = [];
        for (const s of surfaceSnapshots) {
          if (s.scope !== "entity" || !s.entity_id) continue;
          const entityId = String(s.entity_id);
          if (seenEntities.has(entityId)) continue;
          seenEntities.add(entityId);
          entitySnapshots.push({
            id: String(s.id),
            entityId,
            createdAt: String(s.created_at),
          });
          if (entitySnapshots.length >= ENTITY_SNAPSHOT_CAP) break;
        }
        return {
          surface,
          globalBaselineOn: globalRow ? String(globalRow.baseline_on) : null,
          entityOverrideCount,
          impactCount: impactBySurface[surface],
          snapshot: globalSnapshot
            ? {
                id: String(globalSnapshot.id),
                createdAt: String(globalSnapshot.created_at),
              }
            : null,
          entitySnapshots,
        };
      }
    );

    return { data: { surfaces }, error: null };
  } catch (error) {
    return { data: null, error: wrapError("fetchAttentionResetState", error) };
  }
}

// activity-reset: the current global activity-reset baseline date (or null),
// read on the admin dashboard path so the Recent-activity tiles floor at it.
// Admin-readable, so the whole admin team's Home agrees. A failure degrades to
// null (all-time counts — today's behaviour) rather than failing the page.
export async function fetchActivityResetBaseline(
  client: ReadClient
): Promise<ReadResult<string | null>> {
  const { data, error } = await client
    .from("activity_reset_baselines")
    .select("baseline_on")
    .eq("scope", "global")
    .maybeSingle<Pick<ActivityResetBaselinesRow, "baseline_on">>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchActivityResetBaseline", error),
    };
  return { data: data?.baseline_on ?? null, error: null };
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
