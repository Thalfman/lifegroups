// ADR 0014 (#312–#316): server reads for the danger-zone permanent-deletion
// panel — the curated targets a Super Admin can pick from, and the recent
// tombstones they can recover. Both are RLS-gated (tombstones is super-admin
// read only); a failed read degrades to an empty list rather than throwing, so
// the rest of the console still renders.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  PERMANENT_DELETION_ENTITIES,
  findPermanentDeletionEntity,
  type PermanentDeletionItem,
} from "@/lib/admin/permanent-deletion";
import type { TombstonesRow } from "@/types/database";

export type PermanentDeletionTargetGroup = {
  entityType: string;
  label: string;
  pluralLabel: string;
  items: PermanentDeletionItem[];
};

export type RecentTombstone = {
  id: string;
  entityType: string;
  tableName: string;
  entityId: string;
  label: string;
  deletedAt: string;
  restoredAt: string | null;
};

export async function fetchPermanentDeletionTargets(
  client: AppSupabaseClient
): Promise<PermanentDeletionTargetGroup[]> {
  const groups = await Promise.all(
    PERMANENT_DELETION_ENTITIES.map(async (entity) => {
      let items: PermanentDeletionItem[] = [];
      try {
        items = await entity.fetchItems(client);
      } catch {
        items = [];
      }
      return {
        entityType: entity.entityType,
        label: entity.label,
        pluralLabel: entity.pluralLabel,
        items,
      };
    })
  );
  return groups;
}

export async function fetchRecentTombstones(
  client: AppSupabaseClient,
  limit = 20
): Promise<RecentTombstone[]> {
  const { data } = await client
    .from("tombstones")
    .select(
      "id, entity_type, table_name, entity_id, row_snapshot, deleted_at, restored_at"
    )
    .order("deleted_at", { ascending: false })
    .limit(limit);

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
    >
  >;

  return rows.map((r) => {
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
    };
  });
}
