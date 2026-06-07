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

// Operational record types (#316 follow-up). Registering the junction/child
// tables alongside the leaf ones is deliberate: with the "refuse + list"
// dependency rule (no cascade), a Super Admin clears blockers bottom-up, so every
// blocker a preflight names must itself be a deletable target. Each loader is
// bounded with .limit() — fetchPermanentDeletionTargets loads all types in
// parallel on every Super Admin page load.

const MEMBER: PermanentDeletionEntity = {
  entityType: "member",
  label: "Member",
  pluralLabel: "Members",
  async fetchItems(client) {
    const { data } = await client
      .from("members")
      .select("id, full_name, email, status")
      .order("full_name", { ascending: true })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
      status: string | null;
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
    return str(snapshot.full_name) || str(snapshot.email) || "Member";
  },
};

const GROUP_MEMBERSHIP: PermanentDeletionEntity = {
  entityType: "group_membership",
  label: "Group membership",
  pluralLabel: "Group memberships",
  async fetchItems(client) {
    const { data } = await client
      .from("group_memberships")
      .select("id, role, groups(name), members(full_name)")
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      role: string;
      groups: { name: string } | null;
      members: { full_name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.members?.full_name ?? "Member"} in ${
        r.groups?.name ?? "group"
      } (${str(r.role)})`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const role = str(snapshot.role);
    return role ? `Membership (${role})` : "Group membership";
  },
};

const GROUP_LEADER: PermanentDeletionEntity = {
  entityType: "group_leader",
  label: "Group leader assignment",
  pluralLabel: "Group leader assignments",
  async fetchItems(client) {
    const { data } = await client
      .from("group_leaders")
      .select("id, role, active, groups(name), profiles(full_name)")
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      role: string;
      active: boolean;
      groups: { name: string } | null;
      profiles: { full_name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.profiles?.full_name ?? "Leader"} — ${
        r.groups?.name ?? "group"
      } (${str(r.role)})${r.active ? "" : " (inactive)"}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const role = str(snapshot.role);
    return role ? `Leader assignment (${role})` : "Group leader assignment";
  },
};

const ATTENDANCE_SESSION: PermanentDeletionEntity = {
  entityType: "attendance_session",
  label: "Attendance session",
  pluralLabel: "Attendance sessions",
  async fetchItems(client) {
    const { data } = await client
      .from("attendance_sessions")
      .select("id, meeting_week, meeting_date, status, groups(name)")
      .order("meeting_week", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      meeting_week: string;
      meeting_date: string | null;
      status: string | null;
      groups: { name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.groups?.name ?? "Group"} — ${
        str(r.meeting_date) || str(r.meeting_week)
      }`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const week = str(snapshot.meeting_week);
    return week ? `Attendance ${week}` : "Attendance session";
  },
};

const ATTENDANCE_RECORD: PermanentDeletionEntity = {
  entityType: "attendance_record",
  label: "Attendance record",
  pluralLabel: "Attendance records",
  async fetchItems(client) {
    const { data } = await client
      .from("attendance_records")
      .select(
        "id, attendance_status, members(full_name), attendance_sessions(meeting_week)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      attendance_status: string;
      members: { full_name: string } | null;
      attendance_sessions: { meeting_week: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.members?.full_name ?? "Member"} — ${str(
        r.attendance_status
      )}${
        r.attendance_sessions?.meeting_week
          ? ` (${r.attendance_sessions.meeting_week})`
          : ""
      }`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const status = str(snapshot.attendance_status);
    return status ? `Attendance record (${status})` : "Attendance record";
  },
};

const GUEST: PermanentDeletionEntity = {
  entityType: "guest",
  label: "Guest",
  pluralLabel: "Guests",
  async fetchItems(client) {
    const { data } = await client
      .from("guests")
      .select("id, full_name, email, pipeline_stage")
      .order("full_name", { ascending: true })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
      pipeline_stage: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label:
        str(r.full_name) +
        (r.email ? ` <${r.email}>` : "") +
        (r.pipeline_stage ? ` (${r.pipeline_stage})` : ""),
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.full_name) || str(snapshot.email) || "Guest";
  },
};

const FOLLOW_UP: PermanentDeletionEntity = {
  entityType: "follow_up",
  label: "Follow-up",
  pluralLabel: "Follow-ups",
  async fetchItems(client) {
    const { data } = await client
      .from("follow_ups")
      .select("id, type, title, status")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      type: string;
      title: string;
      status: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.title) || str(r.type)}${
        r.status && r.status !== "open" ? ` (${r.status})` : ""
      }`,
    }));
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.title) || str(snapshot.type) || "Follow-up";
  },
};

const GROUP_HEALTH_UPDATE: PermanentDeletionEntity = {
  entityType: "group_health_update",
  label: "Group health update",
  pluralLabel: "Group health updates",
  async fetchItems(client) {
    const { data } = await client
      .from("group_health_updates")
      .select("id, update_week, pulse, groups(name)")
      .order("update_week", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      update_week: string;
      pulse: string | null;
      groups: { name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.groups?.name ?? "Group"} — ${str(r.update_week)}${
        r.pulse ? ` (${r.pulse})` : ""
      }`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const week = str(snapshot.update_week);
    return week ? `Health update ${week}` : "Group health update";
  },
};

const GROUP_HEALTH_ASSESSMENT: PermanentDeletionEntity = {
  entityType: "group_health_assessment",
  label: "Group health assessment",
  pluralLabel: "Group health assessments",
  async fetchItems(client) {
    const { data } = await client
      .from("group_health_assessments")
      .select(
        "id, period_month, computed_letter, override_letter, groups(name)"
      )
      .order("period_month", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      period_month: string;
      computed_letter: string | null;
      override_letter: string | null;
      groups: { name: string } | null;
    }>;
    return rows.map((r) => {
      const grade = str(r.override_letter) || str(r.computed_letter);
      return {
        id: r.id,
        label: `${r.groups?.name ?? "Group"} — ${str(r.period_month)}${
          grade ? ` (${grade})` : ""
        }`,
      };
    });
  },
  labelFromSnapshot(snapshot) {
    const month = str(snapshot.period_month);
    return month ? `Assessment ${month}` : "Group health assessment";
  },
};

// NOTE: group_categories is intentionally NOT registered. The category catalog
// is archive-only by design (a category leaves via soft delete so its cells +
// audit are never orphaned), and its cascade child category_type_targets is not
// itself a deletable target — so hard-deleting a category conflicts with that
// documented workflow and is unclearable bottom-up. Use the archive path.

const INVITATION: PermanentDeletionEntity = {
  entityType: "invitation",
  label: "Invitation",
  pluralLabel: "Invitations",
  async fetchItems(client) {
    const { data } = await client
      .from("invitations")
      .select("id, role, expires_at, revoked_at, used_count, groups(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      role: string;
      expires_at: string;
      revoked_at: string | null;
      used_count: number;
      groups: { name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.role)} invite${
        r.groups?.name ? ` · ${r.groups.name}` : ""
      } — expires ${str(r.expires_at).slice(0, 10)}${
        r.revoked_at
          ? " (revoked)"
          : r.used_count > 0
            ? ` (used ${r.used_count})`
            : ""
      }`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const role = str(snapshot.role);
    return role ? `Invite (${role})` : "Invitation";
  },
};

const SHEPHERD_COVERAGE_ASSIGNMENT: PermanentDeletionEntity = {
  entityType: "shepherd_coverage_assignment",
  label: "Coverage assignment",
  pluralLabel: "Coverage assignments",
  async fetchItems(client) {
    const { data } = await client
      .from("shepherd_coverage_assignments")
      .select("id, active, profiles(full_name), over_shepherds(full_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      active: boolean;
      profiles: { full_name: string } | null;
      over_shepherds: { full_name: string } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${r.profiles?.full_name ?? "Leader"} → ${
        r.over_shepherds?.full_name ?? "over-shepherd"
      }${r.active ? "" : " (inactive)"}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    return `Coverage assignment ${String(snapshot.id ?? "").slice(0, 8)}`;
  },
};

const CHURCH_ATTENDANCE_SNAPSHOT: PermanentDeletionEntity = {
  entityType: "church_attendance_snapshot",
  label: "Church attendance snapshot",
  pluralLabel: "Church attendance snapshots",
  async fetchItems(client) {
    const { data } = await client
      .from("church_attendance_snapshots")
      .select("id, snapshot_date, attendance_count")
      .order("snapshot_date", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Array<{
      id: string;
      snapshot_date: string;
      attendance_count: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      label: `${str(r.snapshot_date)} — ${r.attendance_count}`,
    }));
  },
  labelFromSnapshot(snapshot) {
    const date = str(snapshot.snapshot_date);
    return date ? `Church attendance ${date}` : "Church attendance snapshot";
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
  MEMBER,
  GROUP_MEMBERSHIP,
  GROUP_LEADER,
  ATTENDANCE_SESSION,
  ATTENDANCE_RECORD,
  GUEST,
  FOLLOW_UP,
  GROUP_HEALTH_UPDATE,
  GROUP_HEALTH_ASSESSMENT,
  INVITATION,
  SHEPHERD_COVERAGE_ASSIGNMENT,
  CHURCH_ATTENDANCE_SNAPSHOT,
];

export function findPermanentDeletionEntity(
  entityType: string
): PermanentDeletionEntity | undefined {
  return PERMANENT_DELETION_ENTITIES.find((e) => e.entityType === entityType);
}
