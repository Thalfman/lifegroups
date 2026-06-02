// Demo capacity seed for the dashboard fallback (ADR-0011 follow-on).
//
// The public preview routes render typed demo data when no Supabase client is
// configured. Historically the demo capacity rows were hand-built: the
// warning/full thresholds, capacity status, and effective health were each set
// by hand, making the demo a SECOND source of truth for the capacity-row shape.
// A capacity-rule change in lib/admin/metrics.ts then had to be mirrored here by
// hand, or the demo silently diverged from the live dashboard — the same drift
// risk ADR-0011 already addressed for the guest-pipeline "active stage" rule.
//
// This module instead seeds plain group / membership / metric-settings rows and
// feeds them through the live assembler (buildAdminGroupModel) — the same pure
// cross-domain join the production /admin path runs, and the same one the
// in-memory reads adapter exercises in lib/dashboard/__tests__. The demo
// capacity rows' shape and rules now come from one place.
//
// See docs/adr/0011-group-row-assembly-stays-per-surface.md.

import { buildAdminGroupModel } from "./admin-group-model";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import type { CapacitySummary } from "./types";
import type {
  AppSettingsRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
} from "@/types/database";

// A fixed anchor so the demo capacity rows are deterministic. The capacity
// summary is current-state (not week-scoped), so neither value changes the
// derived rows — but the assembler requires both.
export const DEMO_SELECTED_WEEK = "2026-05-18";
export const DEMO_NOW = new Date("2026-05-18T12:00:00Z");

const STAMP = "2024-01-01T00:00:00Z";

function demoGroup(
  overrides: Partial<GroupsRow> & { id: string; name: string }
): GroupsRow {
  return {
    description: null,
    meeting_day: "Tuesday",
    meeting_time: "19:00",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: null,
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

// n active memberships for a group — the assembler counts rows per group_id, it
// never looks at the member behind each row.
function demoMemberships(groupId: string, n: number): GroupMembershipsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${groupId}-m${i}`,
    group_id: groupId,
    member_id: `${groupId}-mem-${i}`,
    role: "member",
    status: "active",
    joined_at: "2024-01-01",
    ended_at: null,
    created_at: STAMP,
  }));
}

function demoSettings(
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

// The demo deliberately leaves `default_group_capacity` unset so a group with no
// per-group capacity (Bridge Builders) reads as genuinely "unknown" rather than
// inheriting a default. Every other threshold comes from the built-in metric
// defaults, so a change to those rules flows into the demo automatically.
export const DEMO_METRIC_DEFAULTS_ROW: AppSettingsRow = {
  id: "demo-metric-defaults",
  setting_key: "metric_defaults",
  setting_value: { default_group_capacity: null },
  created_at: STAMP,
  updated_at: STAMP,
};

export const DEMO_METRIC_DEFAULTS = decodeMetricDefaults(
  DEMO_METRIC_DEFAULTS_ROW
);

// One seed group per capacity state the demo showcases: at capacity, near
// capacity (per-group + override-sourced), comfortably under (per-group +
// default-sourced thresholds), no capacity configured, and excluded.
export const DEMO_CAPACITY_GROUPS: GroupsRow[] = [
  demoGroup({
    id: "fb-cap-full-1",
    name: "South Campus Women",
    capacity: 14,
    health_status: "capacity_full",
  }),
  demoGroup({
    id: "fb-cap-warn-1",
    name: "Downtown Professionals",
    capacity: 12,
    health_status: "watch",
  }),
  // Capacity comes from a per-group override (see DEMO_CAPACITY_METRIC_SETTINGS).
  demoGroup({
    id: "fb-cap-warn-2",
    name: "Northside Young Adults",
    capacity: null,
  }),
  demoGroup({
    id: "fb-cap-ok-1",
    name: "Eastside Community",
    capacity: 12,
  }),
  demoGroup({
    id: "fb-cap-ok-2",
    name: "Hillside Couples",
    capacity: 10,
  }),
  // No per-group capacity and no configured default → "unknown".
  demoGroup({
    id: "fb-cap-unknown-1",
    name: "Bridge Builders",
    capacity: null,
  }),
  // Excluded from capacity metrics via its override row.
  demoGroup({
    id: "fb-cap-excluded-1",
    name: "Leadership Cohort",
    capacity: null,
  }),
];

export const DEMO_CAPACITY_MEMBERSHIPS: GroupMembershipsRow[] = [
  ...demoMemberships("fb-cap-full-1", 14),
  ...demoMemberships("fb-cap-warn-1", 10),
  ...demoMemberships("fb-cap-warn-2", 10),
  ...demoMemberships("fb-cap-ok-1", 7),
  ...demoMemberships("fb-cap-ok-2", 5),
  ...demoMemberships("fb-cap-unknown-1", 4),
  ...demoMemberships("fb-cap-excluded-1", 18),
];

export const DEMO_CAPACITY_METRIC_SETTINGS: GroupMetricSettingsRow[] = [
  demoSettings({ group_id: "fb-cap-warn-2", capacity_override: 12 }),
  demoSettings({
    group_id: "fb-cap-excluded-1",
    capacity_override: 8,
    exclude_from_capacity_metrics: true,
  }),
];

// The demo capacity summary, derived once by the live assembler from the seed
// above. This is the single source of truth the fallback ships; the test in
// lib/dashboard/__tests__ pins it against the same seed routed through the
// in-memory reads adapter.
export const DEMO_CAPACITY_SUMMARY: CapacitySummary = buildAdminGroupModel({
  groups: DEMO_CAPACITY_GROUPS,
  memberships: DEMO_CAPACITY_MEMBERSHIPS,
  sessions: [],
  healthUpdates: [],
  leaders: [],
  profiles: [],
  metricSettings: DEMO_CAPACITY_METRIC_SETTINGS,
  calendarEvents: [],
  guests: [],
  followUps: [],
  defaults: DEMO_METRIC_DEFAULTS,
  selectedWeek: DEMO_SELECTED_WEEK,
  now: DEMO_NOW,
  activeGroupCount: null,
}).capacitySummary;
