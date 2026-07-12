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

export const PERMANENT_DELETION_PAGE_SIZE = 50;

export type PermanentDeletionPageOptions = {
  offset: number;
  limit: number;
};

export type PermanentDeletionTargetPage = {
  entityType: string;
  page: number;
  items: PermanentDeletionItem[];
  hasPrevious: boolean;
  hasNext: boolean;
};

export type PermanentDeletionTableName =
  | "launch_planning_scenarios"
  | "groups"
  | "profiles"
  | "group_calendar_events"
  | "multiplication_candidates"
  | "leader_pipeline"
  | "over_shepherds"
  | "clean_slate_snapshots"
  | "members"
  | "group_memberships"
  | "group_leaders"
  | "attendance_sessions"
  | "attendance_records"
  | "guests"
  | "follow_ups"
  | "group_health_updates"
  | "group_health_assessments"
  | "invitations"
  | "shepherd_coverage_assignments"
  | "church_attendance_snapshots"
  | "shepherd_care_follow_ups"
  | "shepherd_care_interactions";

export type PermanentDeletionEntity = {
  /** The entity_type token passed to super_admin_permanent_delete. */
  entityType: string;
  /** Singular human label, e.g. "Launch scenario". */
  label: string;
  /** The public table resolved for this entity type. */
  tableName: PermanentDeletionTableName;
  /** Plural human label, e.g. "Launch scenarios". */
  pluralLabel: string;
  /** Load the rows that can be targeted, newest/most-relevant first. */
  fetchItems: (
    client: AppSupabaseClient,
    options: PermanentDeletionPageOptions
  ) => Promise<PermanentDeletionItem[]>;
  /** Derive a readable label from a tombstone's row_snapshot. */
  labelFromSnapshot: (snapshot: Record<string, unknown>) => string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// The danger-zone tables aren't in the generated supabase types, so each
// `fetchItems` loader projects its rows through one named row shape at this
// trust seam. `mapRows` carries that shape on the mapper's parameter and maps a
// nullish/absent result to `[]`, so the loaders stop repeating the
// `(data ?? []) as Array<Row>` loose-cast-then-map block.
function mapRows<Row, T>(data: unknown, mapper: (row: Row) => T): T[] {
  return ((data ?? []) as Array<Row>).map(mapper);
}

// #312 foundation: Launch Scenarios — the lowest-blast entity.
const LAUNCH_SCENARIO: PermanentDeletionEntity = {
  entityType: "launch_scenario",
  label: "Launch scenario",
  pluralLabel: "Launch scenarios",
  tableName: "launch_planning_scenarios",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("launch_planning_scenarios")
      .select("id, name, is_current, archived_at")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        name: string;
        is_current: boolean;
        archived_at: string | null;
      }) => ({
        id: r.id,
        label:
          str(r.name) +
          (r.is_current ? " (current)" : "") +
          (r.archived_at ? " (archived)" : ""),
      })
    );
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
  tableName: "groups",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("groups")
      .select("id, name, lifecycle_status")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: { id: string; name: string; lifecycle_status: string | null }) => ({
        id: r.id,
        label:
          str(r.name) +
          (r.lifecycle_status && r.lifecycle_status !== "active"
            ? ` (${r.lifecycle_status})`
            : ""),
      })
    );
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
  tableName: "profiles",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("profiles")
      .select("id, full_name, email, role, status")
      .neq("role", "super_admin")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        full_name: string;
        email: string;
        role: string;
        status: string;
      }) => ({
        id: r.id,
        label:
          str(r.full_name) +
          (r.email ? ` <${r.email}>` : "") +
          (r.status && r.status !== "active" ? ` (${r.status})` : ""),
      })
    );
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
  tableName: "group_calendar_events",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("group_calendar_events")
      .select("id, title, event_date, event_type")
      .order("event_date", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        title: string | null;
        event_date: string;
        event_type: string;
      }) => ({
        id: r.id,
        label: `${str(r.title) || str(r.event_type)}: ${str(r.event_date)}`,
      })
    );
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
  tableName: "multiplication_candidates",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("multiplication_candidates")
      .select("id, status, target_year")
      .order("target_year", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: { id: string; status: string; target_year: number | null }) => ({
        id: r.id,
        label: `${str(r.status)}${r.target_year ? ` · ${r.target_year}` : ""} (${r.id.slice(0, 8)})`,
      })
    );
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
  tableName: "leader_pipeline",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("leader_pipeline")
      .select("id, display_name, readiness_stage")
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: { id: string; display_name: string; readiness_stage: string }) => ({
        id: r.id,
        label: `${str(r.display_name)}${r.readiness_stage ? `: ${r.readiness_stage}` : ""}`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.display_name) || "Apprentice";
  },
};

const OVER_SHEPHERD: PermanentDeletionEntity = {
  entityType: "over_shepherd",
  label: "Over-Shepherd",
  pluralLabel: "Over-Shepherds",
  tableName: "over_shepherds",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("over_shepherds")
      .select("id, full_name, active")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: { id: string; full_name: string; active: boolean }) => ({
        id: r.id,
        label: `${str(r.full_name)}${r.active ? "" : " (inactive)"}`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.full_name) || "Over-Shepherd";
  },
};

const CLEAN_SLATE_SNAPSHOT: PermanentDeletionEntity = {
  entityType: "clean_slate_snapshot",
  label: "Clean Slate snapshot",
  pluralLabel: "Clean Slate snapshots",
  tableName: "clean_slate_snapshots",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("clean_slate_snapshots")
      .select("id, kind, total_rows, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        kind: string;
        total_rows: number;
        created_at: string;
      }) => ({
        id: r.id,
        label: `${str(r.kind)}: ${r.total_rows} rows (${str(r.created_at).slice(0, 10)})`,
      })
    );
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
// bounded and runs only after the Super Admin selects that entity type; the
// console's initial render never fans out across every registered table.

const MEMBER: PermanentDeletionEntity = {
  entityType: "member",
  label: "Member",
  pluralLabel: "Members",
  tableName: "members",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("members")
      .select("id, full_name, email, status")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        full_name: string;
        email: string | null;
        status: string | null;
      }) => ({
        id: r.id,
        label:
          str(r.full_name) +
          (r.email ? ` <${r.email}>` : "") +
          (r.status && r.status !== "active" ? ` (${r.status})` : ""),
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.full_name) || str(snapshot.email) || "Member";
  },
};

const GROUP_MEMBERSHIP: PermanentDeletionEntity = {
  entityType: "group_membership",
  label: "Group membership",
  pluralLabel: "Group memberships",
  tableName: "group_memberships",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("group_memberships")
      .select("id, role, groups(name), members(full_name)")
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        role: string;
        groups: { name: string } | null;
        members: { full_name: string } | null;
      }) => ({
        id: r.id,
        label: `${r.members?.full_name ?? "Member"} in ${
          r.groups?.name ?? "group"
        } (${str(r.role)})`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    const role = str(snapshot.role);
    return role ? `Membership (${role})` : "Group membership";
  },
};

const GROUP_LEADER: PermanentDeletionEntity = {
  entityType: "group_leader",
  label: "Group shepherd assignment",
  pluralLabel: "Group shepherd assignments",
  tableName: "group_leaders",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("group_leaders")
      .select("id, role, active, groups(name), profiles(full_name)")
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        role: string;
        active: boolean;
        groups: { name: string } | null;
        profiles: { full_name: string } | null;
      }) => ({
        id: r.id,
        label: `${r.profiles?.full_name ?? "Shepherd"}: ${
          r.groups?.name ?? "group"
        } (${str(r.role)})${r.active ? "" : " (inactive)"}`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    const role = str(snapshot.role);
    return role ? `Shepherd assignment (${role})` : "Group shepherd assignment";
  },
};

const ATTENDANCE_SESSION: PermanentDeletionEntity = {
  entityType: "attendance_session",
  label: "Attendance session",
  pluralLabel: "Attendance sessions",
  tableName: "attendance_sessions",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("attendance_sessions")
      .select("id, meeting_week, meeting_date, status, groups(name)")
      .order("meeting_week", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        meeting_week: string;
        meeting_date: string | null;
        status: string | null;
        groups: { name: string } | null;
      }) => ({
        id: r.id,
        label: `${r.groups?.name ?? "Group"}: ${
          str(r.meeting_date) || str(r.meeting_week)
        }`,
      })
    );
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
  tableName: "attendance_records",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("attendance_records")
      .select(
        "id, attendance_status, members(full_name), attendance_sessions(meeting_week)"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        attendance_status: string;
        members: { full_name: string } | null;
        attendance_sessions: { meeting_week: string } | null;
      }) => ({
        id: r.id,
        label: `${r.members?.full_name ?? "Member"}: ${str(
          r.attendance_status
        )}${
          r.attendance_sessions?.meeting_week
            ? ` (${r.attendance_sessions.meeting_week})`
            : ""
        }`,
      })
    );
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
  tableName: "guests",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("guests")
      .select("id, full_name, email, pipeline_stage")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        full_name: string;
        email: string | null;
        pipeline_stage: string | null;
      }) => ({
        id: r.id,
        label:
          str(r.full_name) +
          (r.email ? ` <${r.email}>` : "") +
          (r.pipeline_stage ? ` (${r.pipeline_stage})` : ""),
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.full_name) || str(snapshot.email) || "Guest";
  },
};

const FOLLOW_UP: PermanentDeletionEntity = {
  entityType: "follow_up",
  label: "Follow-up",
  pluralLabel: "Follow-ups",
  tableName: "follow_ups",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("follow_ups")
      .select("id, type, title, status")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        type: string;
        title: string;
        status: string | null;
      }) => ({
        id: r.id,
        label: `${str(r.title) || str(r.type)}${
          r.status && r.status !== "open" ? ` (${r.status})` : ""
        }`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.title) || str(snapshot.type) || "Follow-up";
  },
};

const GROUP_HEALTH_UPDATE: PermanentDeletionEntity = {
  entityType: "group_health_update",
  label: "Group health update",
  pluralLabel: "Group health updates",
  tableName: "group_health_updates",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("group_health_updates")
      .select("id, update_week, pulse, groups(name)")
      .order("update_week", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        update_week: string;
        pulse: string | null;
        groups: { name: string } | null;
      }) => ({
        id: r.id,
        label: `${r.groups?.name ?? "Group"}: ${str(r.update_week)}${
          r.pulse ? ` (${r.pulse})` : ""
        }`,
      })
    );
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
  tableName: "group_health_assessments",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("group_health_assessments")
      .select(
        "id, period_month, computed_letter, override_letter, groups(name)"
      )
      .order("period_month", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        period_month: string;
        computed_letter: string | null;
        override_letter: string | null;
        groups: { name: string } | null;
      }) => {
        const grade = str(r.override_letter) || str(r.computed_letter);
        return {
          id: r.id,
          label: `${r.groups?.name ?? "Group"}: ${str(r.period_month)}${
            grade ? ` (${grade})` : ""
          }`,
        };
      }
    );
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
  tableName: "invitations",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("invitations")
      .select("id, role, expires_at, revoked_at, used_count, groups(name)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        role: string;
        expires_at: string;
        revoked_at: string | null;
        used_count: number;
        groups: { name: string } | null;
      }) => ({
        id: r.id,
        label: `${str(r.role)} invite${
          r.groups?.name ? ` · ${r.groups.name}` : ""
        }: expires ${str(r.expires_at).slice(0, 10)}${
          r.revoked_at
            ? " (revoked)"
            : r.used_count > 0
              ? ` (used ${r.used_count})`
              : ""
        }`,
      })
    );
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
  tableName: "shepherd_coverage_assignments",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("shepherd_coverage_assignments")
      .select("id, active, profiles(full_name), over_shepherds(full_name)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: {
        id: string;
        active: boolean;
        profiles: { full_name: string } | null;
        over_shepherds: { full_name: string } | null;
      }) => ({
        id: r.id,
        label: `${r.profiles?.full_name ?? "Shepherd"} → ${
          r.over_shepherds?.full_name ?? "over-shepherd"
        }${r.active ? "" : " (inactive)"}`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    return `Coverage assignment ${String(snapshot.id ?? "").slice(0, 8)}`;
  },
};

const CHURCH_ATTENDANCE_SNAPSHOT: PermanentDeletionEntity = {
  entityType: "church_attendance_snapshot",
  label: "Church attendance snapshot",
  pluralLabel: "Church attendance snapshots",
  tableName: "church_attendance_snapshots",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("church_attendance_snapshots")
      .select("id, snapshot_date, attendance_count")
      .order("snapshot_date", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (r: { id: string; snapshot_date: string; attendance_count: number }) => ({
        id: r.id,
        label: `${str(r.snapshot_date)}: ${r.attendance_count}`,
      })
    );
  },
  labelFromSnapshot(snapshot) {
    const date = str(snapshot.snapshot_date);
    return date ? `Church attendance ${date}` : "Church attendance snapshot";
  },
};

// SAD9: Care leaf records — the inline super-admin Delete control covers
// everything under the Care tab EXCEPT the confidential care notes & prayer
// requests. Both tables have a uuid `id` PK and no inbound FKs, so they delete
// cleanly. fetchItems is only used by the danger-zone picker; the inline path
// passes entityType + id directly. Both tables' RLS SELECT is admin-only
// (auth_is_admin), which super_admin satisfies, so these reads work server-side.

// care_profile_id -> shepherd_care_profiles -> profiles(full_name): the leader a
// care record is about. Embedded so the destructive danger-zone picker names the
// person, not just a bare title/type+date (two near-identical rows for different
// leaders must be distinguishable before a permanent delete).
type CareSubjectEmbed = {
  shepherd_care_profiles: { profiles: { full_name: string } | null } | null;
};

function careSubjectName(row: CareSubjectEmbed): string {
  return str(row.shepherd_care_profiles?.profiles?.full_name ?? "");
}

const SHEPHERD_CARE_FOLLOW_UP: PermanentDeletionEntity = {
  entityType: "shepherd_care_follow_up",
  label: "Care follow-up",
  pluralLabel: "Care follow-ups",
  tableName: "shepherd_care_follow_ups",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("shepherd_care_follow_ups")
      .select(
        "id, title, status, due_date, shepherd_care_profiles(profiles(full_name))"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (
        r: {
          id: string;
          title: string;
          status: string | null;
          due_date: string | null;
        } & CareSubjectEmbed
      ) => {
        const who = careSubjectName(r);
        const statusSuffix =
          r.status && r.status !== "open" ? ` (${r.status})` : "";
        return {
          id: r.id,
          label: `${who ? `${who} · ` : ""}${str(r.title)}${statusSuffix} [${r.id.slice(0, 8)}]`,
        };
      }
    );
  },
  labelFromSnapshot(snapshot) {
    return str(snapshot.title) || "Care follow-up";
  },
};

const SHEPHERD_CARE_INTERACTION: PermanentDeletionEntity = {
  entityType: "shepherd_care_interaction",
  label: "Care interaction",
  pluralLabel: "Care interactions",
  tableName: "shepherd_care_interactions",
  async fetchItems(client, options) {
    const { data, error } = await client
      .from("shepherd_care_interactions")
      .select(
        "id, interaction_type, interaction_at, shepherd_care_profiles(profiles(full_name))"
      )
      .order("interaction_at", { ascending: false })
      .order("id", { ascending: true })
      .range(options.offset, options.offset + options.limit - 1);
    if (error) throw error;
    return mapRows(
      data,
      (
        r: {
          id: string;
          interaction_type: string;
          interaction_at: string;
        } & CareSubjectEmbed
      ) => {
        const who = careSubjectName(r);
        return {
          id: r.id,
          label: `${who ? `${who} · ` : ""}${str(r.interaction_type)}: ${str(
            r.interaction_at
          ).slice(0, 10)} [${r.id.slice(0, 8)}]`,
        };
      }
    );
  },
  labelFromSnapshot(snapshot) {
    const type = str(snapshot.interaction_type);
    const at = str(snapshot.interaction_at).slice(0, 10);
    return type ? `${type} ${at}`.trim() : "Care interaction";
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
  SHEPHERD_CARE_FOLLOW_UP,
  SHEPHERD_CARE_INTERACTION,
];

export function findPermanentDeletionEntity(
  entityType: string
): PermanentDeletionEntity | undefined {
  return PERMANENT_DELETION_ENTITIES.find((e) => e.entityType === entityType);
}

export function findPermanentDeletionEntityByTable(
  tableName: string
): PermanentDeletionEntity | undefined {
  return PERMANENT_DELETION_ENTITIES.find((e) => e.tableName === tableName);
}

// SAD9: the subset of registered entity types the super-admin INLINE Delete
// control actually renders. The lighter, no-phrase action (superAdminInlineDelete)
// accepts ONLY these — every other registered danger-zone target (snapshots,
// invitations, attendance records, launch-planning records, …) still requires the
// PERMANENTLY DELETE phrase on the danger-zone card. Keeping this explicit, rather
// than "anything in the registry", means a crafted no-phrase request can't drop a
// target the quick-confirm UX was not meant to cover. Every token here must also
// be a registered PERMANENT_DELETION_ENTITIES entry (asserted in tests).
export const INLINE_DELETABLE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  // Care surface (the original ask): everything under Care except the
  // confidential notes & prayer requests.
  "shepherd_care_follow_up",
  "shepherd_care_interaction",
  "over_shepherd",
  "shepherd_coverage_assignment",
  // Main record surfaces the control is wired into.
  "follow_up",
  "group",
  "profile",
  "member",
  "guest",
]);

export function isInlineDeletableEntityType(entityType: string): boolean {
  return INLINE_DELETABLE_ENTITY_TYPES.has(entityType);
}
