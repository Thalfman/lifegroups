// Shared row-fixture builders for the admin dashboard assembler.
//
// buildAdminGroupModel consumes raw Supabase row arrays. Both the production
// demo seed (lib/dashboard/demo-seed.ts) and the assembler unit tests build
// those rows from the builders here, so a new column on GroupsRow /
// GroupMembershipsRow / GroupMetricSettingsRow is defaulted in exactly one
// place — the demo can't drift from the shape the tests pin.

import type {
  AttendanceSessionsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type { LeaderFollowUpRow } from "@/lib/supabase/read-models";

const STAMP = "2024-01-01T00:00:00Z";

export function group(overrides: Partial<GroupsRow> = {}): GroupsRow {
  return {
    id: "group-a",
    name: "Group A",
    description: null,
    meeting_day: "Tuesday",
    meeting_time: "19:00",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: 12,
    lifecycle_status: "active",
    health_status: "healthy",
    audience_category: null,
    life_stage: null,
    launched_on: null,
    pause_reason: null,
    pause_start_date: null,
    expected_return_date: null,
    restart_reminder_date: null,
    admin_notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    closed_at: null,
    ...overrides,
  };
}

export function membership(
  overrides: Partial<GroupMembershipsRow> = {}
): GroupMembershipsRow {
  return {
    id: "m-1",
    group_id: "group-a",
    member_id: "member-1",
    role: "member",
    status: "active",
    joined_at: "2024-01-01",
    ended_at: null,
    created_at: STAMP,
    ...overrides,
  };
}

// n active memberships for a group — the assembler counts rows per group_id, it
// never looks at the member behind each row.
export function memberships(groupId: string, n: number): GroupMembershipsRow[] {
  return Array.from({ length: n }, (_, i) =>
    membership({
      id: `${groupId}-m${i}`,
      group_id: groupId,
      member_id: `mem-${i}`,
    })
  );
}

export function settings(
  overrides: Partial<GroupMetricSettingsRow> & { group_id: string }
): GroupMetricSettingsRow {
  return {
    capacity_override: null,
    capacity_warning_threshold_pct_override: null,
    healthy_attendance_pct_override: null,
    manual_health_status_override: null,
    exclude_from_capacity_metrics: false,
    admin_metric_notes: null,
    check_in_due_offset_hours_override: null,
    allow_over_capacity: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

// A profile the assembler can resolve a leader name from. The assembler only
// reads `id` + `full_name`; the rest are defaulted so a new ProfilesRow column
// lands here once.
export function profile(
  overrides: Partial<ProfilesRow> & { id: string; full_name: string }
): ProfilesRow {
  return {
    auth_user_id: null,
    email: `${overrides.id}@example.test`,
    phone: null,
    role: "leader",
    status: "active",
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function leader(
  overrides: Partial<GroupLeadersRow> & {
    group_id: string;
    profile_id: string;
  }
): GroupLeadersRow {
  return {
    id: `${overrides.group_id}-${overrides.profile_id}`,
    role: "leader",
    assigned_at: "2024-01-01",
    active: true,
    created_at: STAMP,
    ...overrides,
  };
}

// One attendance session for a group/week. The assembler keys sessions by
// group_id and only reads `status`, so the week/date fields are defaulted to
// the demo anchor week.
export function session(
  overrides: Partial<AttendanceSessionsRow> & { group_id: string }
): AttendanceSessionsRow {
  return {
    id: `${overrides.group_id}-session`,
    meeting_week: "2026-05-18",
    meeting_date: null,
    status: "submitted",
    submitted_by: null,
    submitted_at: null,
    leader_note: null,
    admin_note: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function healthUpdate(
  overrides: Partial<GroupHealthUpdatesRow> & { group_id: string }
): GroupHealthUpdatesRow {
  return {
    id: `${overrides.group_id}-health`,
    submitted_by: null,
    update_week: "2026-05-18",
    pulse: "healthy",
    follow_up_needed: false,
    leader_note: null,
    admin_note: null,
    created_at: STAMP,
    ...overrides,
  };
}

export function followUp(
  overrides: Partial<LeaderFollowUpRow> & { id: string }
): LeaderFollowUpRow {
  return {
    type: "care",
    title: "Follow up",
    related_group_id: null,
    related_member_id: null,
    related_guest_id: null,
    assigned_to: null,
    priority: "normal",
    due_date: null,
    status: "open",
    leader_visible_note: null,
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
    ...overrides,
  };
}
