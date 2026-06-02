// Demo dashboard seed for the /admin fallback (ADR-0011 follow-on).
//
// The public preview routes render typed demo data when no Supabase client is
// configured. Historically EVERY demo dashboard shape — capacity rows, the
// health buckets, the attention queue, the setup-gap lists, and the launch
// snapshot — was hand-built, each one a SECOND source of truth for both its
// shape and its derivation rules. A rule change in lib/admin (capacity status,
// the attention ladder, the launch forecast) then had to be mirrored here by
// hand, or the demo silently diverged from the live dashboard.
//
// This module instead seeds plain group / membership / metric-settings /
// leader / profile / session / follow-up rows and feeds them through the live
// assembler (buildAdminGroupModel) — the same pure cross-domain join the
// production /admin path runs, and the same one the in-memory reads adapter
// exercises in lib/dashboard/__tests__. The launch snapshot derives from the
// same seed through the shared buildLaunchPlanningSnapshot. Every demo shape's
// shape AND rules now come from one place: a rule change flows into the demo
// automatically (the seed tests pin that).
//
// See docs/adr/0011-group-row-assembly-stays-per-surface.md.

import {
  buildAdminGroupModel,
  type AdminGroupModelInput,
} from "./admin-group-model";
import { buildLaunchPlanningSnapshot } from "./launch-planning-snapshot";
import { decodeMetricDefaults, type MetricDefaults } from "@/lib/admin/metrics";
import {
  followUp,
  group,
  leader,
  memberships,
  profile,
  session,
  settings,
} from "./group-fixtures";
import type {
  AttentionItem,
  CapacitySummary,
  HealthSummary,
  LaunchPlanningDashboardSnapshot,
  SetupGaps,
} from "./types";
import type { LeaderFollowUpRow } from "@/lib/supabase/read-models";
import type {
  AppSettingsRow,
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";

// A fixed anchor so the demo dashboard is deterministic. 2026-05-18 is a
// Monday (the ISO week start) in week 21 (odd), and `now` sits at Monday noon —
// before the Tuesday-evening meetings — so the due-date math the attention
// queue carries is stable. DEMO_NOW is kept as an ISO instant (parsed fresh at
// each use) rather than a shared mutable Date.
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

// The launch card reads a church-attendance assumption. 110 over the 58 seeded
// participants yields a representative "watch" forecast (a small launch gap)
// rather than a flat "no action needed" card. Everything else falls to the
// built-in launch defaults so a forecast-rule change flows into the demo.
export const DEMO_LAUNCH_ASSUMPTIONS_ROW: AppSettingsRow = {
  id: "demo-launch-assumptions",
  setting_key: "launch_planning_assumptions",
  setting_value: { current_church_attendance: 110 },
  created_at: STAMP,
  updated_at: STAMP,
};

// One seed group per state the demo showcases. Capacity spread: at capacity,
// near capacity (per-group capacity + an override-sourced one), comfortably
// under (×3, one of them an off-parity bi-weekly group), no capacity configured
// (→ unknown), and excluded. Health/attention spread is layered on top via the
// session, follow-up and health_status seeds below. The launching-soon group
// carries no leader / day-time / members so the setup-gap lists are non-empty.
// Every grading comes from the shared rules, not any value set in this module.
export const DEMO_GROUPS: GroupsRow[] = [
  group({
    id: "fb-cap-full-1",
    name: "South Campus Women",
    capacity: 14,
    health_status: "needs_follow_up",
    meeting_day: "Wednesday",
    meeting_time: "19:00",
  }),
  group({
    id: "fb-cap-warn-1",
    name: "Downtown Professionals",
    capacity: 12,
    health_status: "watch",
    meeting_day: "Thursday",
    meeting_time: "18:30",
  }),
  // Capacity comes from a per-group override (see DEMO_METRIC_SETTINGS).
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
  // Comfortably under capacity AND off-parity this week (bi-weekly, even weeks),
  // so with no session it reads "healthy" rather than "missing".
  group({
    id: "fb-healthy-1",
    name: "Lakeside Fellowship",
    capacity: 12,
    meeting_frequency: "biweekly",
    meeting_week_parity: "even",
  }),
  // No per-group capacity and no configured default → "unknown".
  group({
    id: "fb-cap-unknown-1",
    name: "Bridge Builders",
    capacity: null,
    meeting_day: "Monday",
    meeting_time: "19:00",
  }),
  // Excluded from capacity metrics via its override row.
  group({
    id: "fb-cap-excluded-1",
    name: "Leadership Cohort",
    capacity: null,
  }),
  // Pre-launch: not active (so it stays out of the capacity board), but it
  // carries no leader, no meeting day/time, and no members so the setup-gap
  // lists and the no_leader attention item are populated. Capacity is planned
  // (12) so it is NOT flagged as a capacity gap.
  group({
    id: "fb-no-leader-1",
    name: "Pending Launch Group",
    capacity: 12,
    lifecycle_status: "launching_soon",
    meeting_day: null,
    meeting_time: null,
  }),
];

export const DEMO_MEMBERSHIPS: GroupMembershipsRow[] = [
  ...memberships("fb-cap-full-1", 14),
  ...memberships("fb-cap-warn-1", 10),
  ...memberships("fb-cap-warn-2", 10),
  ...memberships("fb-cap-ok-1", 7),
  ...memberships("fb-cap-ok-2", 5),
  ...memberships("fb-healthy-1", 8),
  ...memberships("fb-cap-unknown-1", 4),
  ...memberships("fb-cap-excluded-1", 18),
  // fb-no-leader-1: no members (drives the no_members gap).
];

export const DEMO_METRIC_SETTINGS: GroupMetricSettingsRow[] = [
  settings({ group_id: "fb-cap-warn-2", capacity_override: 12 }),
  settings({
    group_id: "fb-cap-excluded-1",
    capacity_override: 8,
    exclude_from_capacity_metrics: true,
  }),
];

// Leaders + their profiles. buildLeaderNames resolves a leader to its profile's
// full_name, primary leaders before co-leaders. The launching-soon group is
// deliberately left without a leader.
export const DEMO_PROFILES: ProfilesRow[] = [
  profile({ id: "p-priya", full_name: "Priya Mehta" }),
  profile({ id: "p-noah", full_name: "Noah Bennett" }),
  profile({ id: "p-avery", full_name: "Avery Lewis" }),
  profile({ id: "p-sam", full_name: "Sam Park" }),
  profile({ id: "p-jonah", full_name: "Jonah Reyes" }),
  profile({ id: "p-grace", full_name: "Grace Tan" }),
  profile({ id: "p-eli", full_name: "Eli Robinson" }),
  profile({ id: "p-hannah", full_name: "Hannah Brooks" }),
  profile({ id: "p-jordan", full_name: "Jordan Kim" }),
  profile({ id: "p-marcus", full_name: "Marcus Hill" }),
];

export const DEMO_LEADERS: GroupLeadersRow[] = [
  leader({ group_id: "fb-cap-full-1", profile_id: "p-priya" }),
  leader({ group_id: "fb-cap-warn-1", profile_id: "p-noah" }),
  leader({ group_id: "fb-cap-warn-2", profile_id: "p-avery" }),
  leader({ group_id: "fb-cap-warn-2", profile_id: "p-sam", role: "co_leader" }),
  leader({ group_id: "fb-cap-ok-1", profile_id: "p-jonah" }),
  leader({ group_id: "fb-cap-ok-2", profile_id: "p-grace" }),
  leader({ group_id: "fb-cap-ok-2", profile_id: "p-eli", role: "co_leader" }),
  leader({ group_id: "fb-healthy-1", profile_id: "p-hannah" }),
  leader({ group_id: "fb-cap-unknown-1", profile_id: "p-jordan" }),
  leader({ group_id: "fb-cap-excluded-1", profile_id: "p-marcus" }),
];

// Sessions for the demo week. The health buckets read the session status:
// submitted → "submitted", did_not_meet / planned_pause → their own buckets,
// no session on a scheduled weekly group → "missing". Groups with a watch /
// needs_follow_up effective health bucket on that signal regardless of session.
export const DEMO_SESSIONS: AttendanceSessionsRow[] = [
  session({ group_id: "fb-cap-full-1", status: "submitted" }),
  session({ group_id: "fb-cap-warn-1", status: "submitted" }),
  session({ group_id: "fb-cap-warn-2", status: "submitted" }),
  session({ group_id: "fb-cap-excluded-1", status: "submitted" }),
  session({ group_id: "fb-cap-ok-1", status: "did_not_meet" }),
  session({ group_id: "fb-cap-ok-2", status: "planned_pause" }),
  // fb-cap-unknown-1 + fb-no-leader-1: no session → "missing".
  // fb-healthy-1: no session, off-parity week → "healthy".
];

// One open follow-up so the top attention card reads "follow-up open" (the
// highest-priority reason) for the at-capacity group, exactly as a live group
// with an open follow-up would.
export const DEMO_FOLLOW_UPS: LeaderFollowUpRow[] = [
  followUp({
    id: "demo-fu-1",
    type: "care",
    title: "Check in with South Campus Women leaders",
    related_group_id: "fb-cap-full-1",
    priority: "high",
  }),
];

// The assembler input for the demo seed, parameterised by the metric defaults
// so the fallback derivation and the seed tests build it exactly one way. The
// week / now are required by the assembler and anchor the due-date math.
export function demoAdminModelInput(
  defaults: MetricDefaults
): AdminGroupModelInput {
  return {
    groups: DEMO_GROUPS,
    memberships: DEMO_MEMBERSHIPS,
    sessions: DEMO_SESSIONS,
    healthUpdates: [],
    leaders: DEMO_LEADERS,
    profiles: DEMO_PROFILES,
    metricSettings: DEMO_METRIC_SETTINGS,
    calendarEvents: [],
    guests: [],
    followUps: DEMO_FOLLOW_UPS,
    defaults,
    selectedWeek: DEMO_SELECTED_WEEK,
    now: new Date(DEMO_NOW_ISO),
    activeGroupCount: null,
  };
}

// The demo dashboard, derived once by the live assembler from the seed above —
// the single source of truth the fallback ships. The tests in
// lib/dashboard/__tests__ pin each shape against the same seed routed through
// the in-memory reads adapter.
export const DEMO_ADMIN_MODEL = buildAdminGroupModel(
  demoAdminModelInput(DEMO_METRIC_DEFAULTS)
);

export const DEMO_CAPACITY_SUMMARY: CapacitySummary =
  DEMO_ADMIN_MODEL.capacitySummary;
export const DEMO_HEALTH_SUMMARY: HealthSummary =
  DEMO_ADMIN_MODEL.healthSummary;
export const DEMO_ATTENTION_ITEMS: AttentionItem[] =
  DEMO_ADMIN_MODEL.attentionItems;
export const DEMO_SETUP_GAPS: SetupGaps = DEMO_ADMIN_MODEL.setupGaps;

// The launch snapshot derives from the SAME derived rows + a demo assumptions
// row through the shared builder the live /admin path uses, so the demo launch
// card can't drift from the live card's shape or its forecast rules.
export const DEMO_LAUNCH_PLANNING: LaunchPlanningDashboardSnapshot =
  buildLaunchPlanningSnapshot(
    { data: DEMO_LAUNCH_ASSUMPTIONS_ROW, error: null },
    DEMO_ADMIN_MODEL.derivedRows,
    DEMO_METRIC_DEFAULTS
  );
