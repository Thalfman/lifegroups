// ADR 0014 (#312–#316): the client/server-shared registry of curated
// permanent-deletion entity types. Each entry mirrors one branch of the
// super_admin_deletable_table() SQL allowlist: the entity_type token the RPC
// expects, human labels for the danger-zone picker, a typed loader for the rows
// that can be targeted, and a label derived from a tombstone snapshot (so the
// recovery list can name a deleted row without re-reading the source table).
//
// Adding an entity type is mechanical: register its branch in the SQL resolver
// AND add an entry here. The two lists are intentionally kept in lockstep — a
// type registered in SQL but not here is simply never offered in the UI.

import type { AppSupabaseClient } from "@/lib/supabase/types";

export type PermanentDeletionItem = {
  id: string;
  label: string;
};

export type PermanentDeletionEntity = {
  /** The entity_type token passed to super_admin_permanent_delete. */
  entityType: string;
  /** Singular human label, e.g. "Launch scenario". */
  label: string;
  /** Plural human label, e.g. "Launch scenarios". */
  pluralLabel: string;
  /** Load the rows that can be targeted, newest/most-relevant first. */
  fetchItems: (client: AppSupabaseClient) => Promise<PermanentDeletionItem[]>;
  /** Derive a readable label from a tombstone's row_snapshot. */
  labelFromSnapshot: (snapshot: Record<string, unknown>) => string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// #312 foundation: Launch Scenarios — the lowest-blast entity.
const LAUNCH_SCENARIO: PermanentDeletionEntity = {
  entityType: "launch_scenario",
  label: "Launch scenario",
  pluralLabel: "Launch scenarios",
  async fetchItems(client) {
    const { data } = await client
      .from("launch_planning_scenarios")
      .select("id, name, is_current, archived_at")
      .order("name", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      is_current: boolean;
      archived_at: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label:
        str(r.name) +
        (r.is_current ? " — current" : "") +
        (r.archived_at ? " (archived)" : ""),
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.name) || "Launch scenario";
  },
};

// Registry order is the order the picker lists entity types.
export const PERMANENT_DELETION_ENTITIES: PermanentDeletionEntity[] = [
  LAUNCH_SCENARIO,
];

export function findPermanentDeletionEntity(
  entityType: string
): PermanentDeletionEntity | undefined {
  return PERMANENT_DELETION_ENTITIES.find((e) => e.entityType === entityType);
}
