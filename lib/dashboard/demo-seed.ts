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

import {
  buildAdminGroupModel,
  type AdminGroupModelInput,
} from "./admin-group-model";
import { decodeMetricDefaults, type MetricDefaults } from "@/lib/admin/metrics";
import { group, memberships, settings } from "./group-fixtures";
import type { CapacitySummary } from "./types";
import type {
  AppSettingsRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
} from "@/types/database";

// A fixed anchor so the demo capacity rows are deterministic. The capacity
// summary is current-state (not week-scoped), so neither value changes the
// derived rows — but the assembler requires both. DEMO_NOW is kept as an ISO
// instant (parsed fresh at each use) rather than a shared mutable Date.
export const DEMO_SELECTED_WEEK = "2026-05-18";
export const DEMO_NOW_ISO = "2026-05-18T12:00:00Z";

const STAMP = "2024-01-01T00:00:00Z";

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
// capacity (per-group capacity + an override-sourced capacity), comfortably
// under, no capacity configured (→ unknown), and excluded. Every row is graded
// against the shared metric thresholds, not any value set in this module.
export const DEMO_CAPACITY_GROUPS: GroupsRow[] = [
  group({
    id: "fb-cap-full-1",
    name: "South Campus Women",
    capacity: 14,
    health_status: "capacity_full",
  }),
  group({
    id: "fb-cap-warn-1",
    name: "Downtown Professionals",
    capacity: 12,
    health_status: "watch",
  }),
  // Capacity comes from a per-group override (see DEMO_CAPACITY_METRIC_SETTINGS).
  group({
    id: "fb-cap-warn-2",
    name: "Northside Young Adults",
    capacity: null,
  }),
  group({
    id: "fb-cap-ok-1",
    name: "Eastside Community",
    capacity: 12,
  }),
  group({
    id: "fb-cap-ok-2",
    name: "Hillside Couples",
    capacity: 10,
  }),
  // No per-group capacity and no configured default → "unknown".
  group({
    id: "fb-cap-unknown-1",
    name: "Bridge Builders",
    capacity: null,
  }),
  // Excluded from capacity metrics via its override row.
  group({
    id: "fb-cap-excluded-1",
    name: "Leadership Cohort",
    capacity: null,
  }),
];

export const DEMO_CAPACITY_MEMBERSHIPS: GroupMembershipsRow[] = [
  ...memberships("fb-cap-full-1", 14),
  ...memberships("fb-cap-warn-1", 10),
  ...memberships("fb-cap-warn-2", 10),
  ...memberships("fb-cap-ok-1", 7),
  ...memberships("fb-cap-ok-2", 5),
  ...memberships("fb-cap-unknown-1", 4),
  ...memberships("fb-cap-excluded-1", 18),
];

export const DEMO_CAPACITY_METRIC_SETTINGS: GroupMetricSettingsRow[] = [
  settings({ group_id: "fb-cap-warn-2", capacity_override: 12 }),
  settings({
    group_id: "fb-cap-excluded-1",
    capacity_override: 8,
    exclude_from_capacity_metrics: true,
  }),
];

// The assembler input for the demo capacity seed, parameterised by the metric
// defaults so the fallback and the seed tests build it exactly one way. The
// week / now are required by the assembler but don't affect the capacity rows.
export function demoCapacityModelInput(
  defaults: MetricDefaults
): AdminGroupModelInput {
  return {
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
    defaults,
    selectedWeek: DEMO_SELECTED_WEEK,
    now: new Date(DEMO_NOW_ISO),
    activeGroupCount: null,
  };
}

// The demo capacity summary, derived once by the live assembler from the seed
// above — the single source of truth the fallback ships. The tests in
// lib/dashboard/__tests__ pin it against the same seed routed through the
// in-memory reads adapter.
export const DEMO_CAPACITY_SUMMARY: CapacitySummary = buildAdminGroupModel(
  demoCapacityModelInput(DEMO_METRIC_DEFAULTS)
).capacitySummary;
