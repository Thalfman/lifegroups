// Groups domain slice of the admin RPC gateway: group lifecycle, roster
// assignment, group calendar events, and the admin-managed group-type list +
// per-type config. The named arg shapes here predate the args map and are
// imported by action / validation modules, so they stay exported unchanged; the
// args-map slice references them by name.

import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
  MeetingFrequency,
  MeetingWeekParity,
  RoleInGroup,
} from "@/types/enums";

export type GroupRpcArgs = {
  p_name: string;
  p_description: string | null;
  p_meeting_day: string | null;
  p_meeting_time: string | null;
  p_location_area: string | null;
  p_address_optional: string | null;
  p_capacity: number | null;
  p_meeting_frequency: MeetingFrequency;
  p_meeting_week_parity: MeetingWeekParity | null;
  // Free-text group type, chosen from the admin-managed list. null = Untyped.
  // Replaces the retired p_audience_category + p_category_id cell args.
  p_group_type: string | null;
  p_launched_on: string | null;
};

export type AdminCreateGroupCalendarEventArgs = {
  p_group_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

export type AdminUpdateGroupCalendarEventArgs = {
  p_event_id: string;
  p_event_date: string;
  p_start_time: string | null;
  p_end_time: string | null;
  p_event_type: GroupCalendarEventType;
  p_status: GroupCalendarEventStatus;
  p_title: string | null;
  p_description: string | null;
};

// The uuid-channel args-map slice for the groups domain. Keys are the LITERAL
// Postgres function names; every RPC here returns a uuid on success.
export type GroupUuidRpcArgs = {
  admin_assign_leader_to_group: {
    p_group_id: string;
    p_profile_id: string;
    p_role: RoleInGroup;
  };
  admin_assign_member_to_group: { p_group_id: string; p_member_id: string };
  // Group roster create-and-assign (#643): create a brand-new member or leader
  // AND put them on one group's roster in a single audited transaction. p_role
  // is the in-group role for leaders (leader/co_leader) and null for members.
  admin_add_person_to_group: {
    p_group_id: string;
    p_kind: "member" | "leader";
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
    p_role: RoleInGroup | null;
  };
  // Roster removal (Groups/People overhaul): take one person off one group's
  // roster without touching the person's status. Soft flags only — the inverse
  // of the two assign RPCs above, which revive these rows on re-assign.
  admin_unassign_leader_from_group: {
    p_group_id: string;
    p_profile_id: string;
  };
  admin_end_group_membership: { p_group_id: string; p_member_id: string };
  // Phase 5A.2 group management RPCs.
  admin_create_group: GroupRpcArgs;
  admin_update_group: GroupRpcArgs & { p_group_id: string };
  admin_close_group: { p_group_id: string };
  admin_reopen_group: { p_group_id: string };
  // Phase 5A.6 group calendar admin RPCs.
  admin_create_group_calendar_event: AdminCreateGroupCalendarEventArgs;
  admin_update_group_calendar_event: AdminUpdateGroupCalendarEventArgs;
  admin_archive_group_calendar_event: { p_event_id: string };
  admin_restore_group_calendar_event: { p_event_id: string };
  // Settings > Group types: replace the canonical free-text type-name list
  // (app_settings keyed row). p_types is the validated, trimmed, deduped list.
  admin_set_group_types: { p_types: unknown[] };
  // Intake forms (e.g. the Prospect desired-type picker): idempotently append a
  // single new free-text type to the canonical list, preserving order.
  admin_add_group_type: { p_group_type: string };
  // Multiply: upsert one group type's config (target group count + an optional
  // readiness-rule override; null/empty rule = inherit the global rule), keyed
  // on the free-text type name.
  admin_set_group_type_config: {
    p_group_type: string;
    p_target_count: number;
    p_readiness_rule: Record<string, unknown> | null;
  };
  // Multiply Pipeline (ADR 0030): set/clear one group type's pipeline intent,
  // keyed on the free-text type name (upserts the config row if absent).
  admin_set_group_type_in_pipeline: {
    p_group_type: string;
    p_in_pipeline: boolean;
  };
};
