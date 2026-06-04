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

// #313: Groups — proves the block + report dependency rule.
const GROUP: PermanentDeletionEntity = {
  entityType: "group",
  label: "Group",
  pluralLabel: "Groups",
  async fetchItems(client) {
    const { data } = await client
      .from("groups")
      .select("id, name, lifecycle_status")
      .order("name", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      lifecycle_status: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label:
        str(r.name) +
        (r.lifecycle_status && r.lifecycle_status !== "active"
          ? ` (${r.lifecycle_status})`
          : ""),
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.name) || "Group";
  },
};

// #314: People / Profiles. super_admin profiles are filtered out here for UX
// (the RPC also refuses them with forbidden_target).
const PROFILE: PermanentDeletionEntity = {
  entityType: "profile",
  label: "Person",
  pluralLabel: "People",
  async fetchItems(client) {
    const { data } = await client
      .from("profiles")
      .select("id, full_name, email, role, status")
      .neq("role", "super_admin")
      .order("full_name", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      status: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label:
        str(r.full_name) +
        (r.email ? ` <${r.email}>` : "") +
        (r.status && r.status !== "active" ? ` (${r.status})` : ""),
    }));
  },
  labelFromSnapshot(snapshot) {
    const name = str(snapshot.full_name);
    const email = str(snapshot.email);
    return name || email || "Person";
  },
};

// #316: the remaining curated operational entities.

const CALENDAR_EVENT: PermanentDeletionEntity = {
  entityType: "calendar_event",
  label: "Calendar event",
  pluralLabel: "Calendar events",
  async fetchItems(client) {
    const { data } = await client
      .from("group_calendar_events")
      .select("id, title, event_date, event_type")
      .order("event_date", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      title: string | null;
      event_date: string;
      event_type: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.title) || str(r.event_type)} — ${str(r.event_date)}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    return (
      str(snapshot.title) ||
      `${str(snapshot.event_type)} ${str(snapshot.event_date)}`.trim() ||
      "Calendar event"
    );
  },
};

const MULTIPLICATION_CANDIDATE: PermanentDeletionEntity = {
  entityType: "multiplication_candidate",
  label: "Multiplication candidate",
  pluralLabel: "Multiplication candidates",
  async fetchItems(client) {
    const { data } = await client
      .from("multiplication_candidates")
      .select("id, status, target_year")
      .order("target_year", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      status: string;
      target_year: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.status)}${r.target_year ? ` · ${r.target_year}` : ""} (${r.id.slice(0, 8)})`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const status = str(snapshot.status);
    return status ? `Candidate (${status})` : "Multiplication candidate";
  },
};

const APPRENTICE: PermanentDeletionEntity = {
  entityType: "apprentice",
  label: "Apprentice",
  pluralLabel: "Apprentices",
  async fetchItems(client) {
    const { data } = await client
      .from("leader_pipeline")
      .select("id, display_name, readiness_stage")
      .order("display_name", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string;
      display_name: string;
      readiness_stage: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.display_name)}${r.readiness_stage ? ` — ${r.readiness_stage}` : ""}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.display_name) || "Apprentice";
  },
};

const OVER_SHEPHERD: PermanentDeletionEntity = {
  entityType: "over_shepherd",
  label: "Over-Shepherd",
  pluralLabel: "Over-Shepherds",
  async fetchItems(client) {
    const { data } = await client
      .from("over_shepherds")
      .select("id, full_name, active")
      .order("full_name", { ascending: true });
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      active: boolean;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.full_name)}${r.active ? "" : " (inactive)"}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.full_name) || "Over-Shepherd";
  },
};

const CLEAN_SLATE_SNAPSHOT: PermanentDeletionEntity = {
  entityType: "clean_slate_snapshot",
  label: "Clean Slate snapshot",
  pluralLabel: "Clean Slate snapshots",
  async fetchItems(client) {
    const { data } = await client
      .from("clean_slate_snapshots")
      .select("id, kind, total_rows, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as Array<{
      id: string;
      kind: string;
      total_rows: number;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.kind)} — ${r.total_rows} rows (${str(r.created_at).slice(0, 10)})`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const kind = str(snapshot.kind);
    return kind ? `Snapshot (${kind})` : "Clean Slate snapshot";
  },
};

// Registry order is the order the picker lists entity types.
export const PERMANENT_DELETION_ENTITIES: PermanentDeletionEntity[] = [
  LAUNCH_SCENARIO,
  GROUP,
  PROFILE,
  CALENDAR_EVENT,
  MULTIPLICATION_CANDIDATE,
  APPRENTICE,
  OVER_SHEPHERD,
  CLEAN_SLATE_SNAPSHOT,
];

export function findPermanentDeletionEntity(
  entityType: string
): PermanentDeletionEntity | undefined {
  return PERMANENT_DELETION_ENTITIES.find((e) => e.entityType === entityType);
}
