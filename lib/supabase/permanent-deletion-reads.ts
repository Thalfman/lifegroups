import "server-only";

// ADR 0014 (#312–#316): server reads for the danger-zone permanent-deletion
// panel. The initial target catalog is metadata-only; a guarded server action
// loads one bounded target page after a Super Admin chooses its type. Recent
// tombstones are super-admin RLS-gated and retain explicit failed/empty/loaded
// state so an unavailable read is never presented as a healthy empty history.

import {
  PERMANENT_DELETION_ENTITIES,
  findPermanentDeletionEntity,
  type PermanentDeletionItem,
} from "@/lib/admin/permanent-deletion";
import type { TombstonesRow } from "@/types/database";
import { columns, type ReadClient } from "./read-core";

const SUPER_ADMIN_TOMBSTONE_COLUMNS = columns<
  Pick<
    TombstonesRow,
    | "id"
    | "entity_type"
    | "table_name"
    | "entity_id"
    | "row_snapshot"
    | "deleted_at"
    | "restored_at"
    | "restorable"
  >
>()(
  "id",
  "entity_type",
  "table_name",
  "entity_id",
  "row_snapshot",
  "deleted_at",
  "restored_at",
  "restorable"
);

export type PermanentDeletionTargetGroup = {
  entityType: string;
  label: string;
  pluralLabel: string;
  items: PermanentDeletionItem[];
  status: "idle" | "failed" | "empty" | "loaded";
};

export type RecentTombstone = {
  id: string;
  entityType: string;
  tableName: string;
  entityId: string;
  label: string;
  deletedAt: string;
  restoredAt: string | null;
  restorable: boolean;
};
export type RecentTombstonesState =
  | { status: "failed"; tombstones: [] }
  | { status: "empty"; tombstones: [] }
  | { status: "loaded"; tombstones: RecentTombstone[] };

// This initial catalog is metadata only. Individual target rows are loaded by
// superAdminLoadPermanentDeletionTargets after the operator chooses one type.
export async function fetchPermanentDeletionTargetCatalog(
  _client: ReadClient
): Promise<PermanentDeletionTargetGroup[]> {
  return PERMANENT_DELETION_ENTITIES.map((entity) => ({
    entityType: entity.entityType,
    label: entity.label,
    pluralLabel: entity.pluralLabel,
    status: "idle" as const,
    items: [],
  }));
}

export async function fetchRecentTombstones(
  client: ReadClient,
  limit = 20
): Promise<RecentTombstonesState> {
  const { data, error } = await client
    .from("tombstones")
    .select(SUPER_ADMIN_TOMBSTONE_COLUMNS.select)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  if (error) return { status: "failed", tombstones: [] };

  const rows = (data ?? []) as Array<
    Pick<
      TombstonesRow,
      | "id"
      | "entity_type"
      | "table_name"
      | "entity_id"
      | "row_snapshot"
      | "deleted_at"
      | "restored_at"
      | "restorable"
    >
  >;

  const tombstones = rows.map((r) => {
    const entity = findPermanentDeletionEntity(r.entity_type);
    const label =
      entity?.labelFromSnapshot(r.row_snapshot ?? {}) ??
      `${r.table_name} ${r.entity_id.slice(0, 8)}`;
    return {
      id: r.id,
      entityType: r.entity_type,
      tableName: r.table_name,
      entityId: r.entity_id,
      label,
      deletedAt: r.deleted_at,
      restoredAt: r.restored_at,
      restorable: r.restorable,
    };
  });

  return tombstones.length === 0
    ? { status: "empty", tombstones: [] }
    : { status: "loaded", tombstones };
}
