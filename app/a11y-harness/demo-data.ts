// Demo reads adapters for the a11y harness (ADR 0038; review 2026-07-06
// candidate 4, safe slice).
//
// The harness's job is to mount REAL surfaces with deterministic data. For the
// surfaces that have a reads-seam build function (ADR 0015), hand-typing the
// builder's OUTPUT here is a second source of truth that drifts silently — a
// builder change can reshape what the live page renders while the harness keeps
// rendering yesterday's literal. Instead, this module holds small in-memory
// adapters over seed ROWS and routes them through the same `buildXData` the
// live pages call, so a shape or derivation change breaks the harness build
// (and its pin test, __tests__/demo-data.test.ts) instead of drifting.
//
// This is a SERVER module: the build functions transitively import
// `@/lib/supabase/server` (→ next/headers) and `server-only` read modules, so
// the "use client" harness cannot call them. The harness page (a server
// component) awaits `buildHarnessDemoData()` once and passes the plain-JSON
// result down as a prop; harness-client imports only the TYPE.

import {
  buildAdminFollowUpsData,
  type AdminFollowUpsReads,
} from "@/components/admin/follow-ups/follow-ups-data";
import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import {
  buildSettingsData,
  type SettingsReads,
} from "@/components/admin/settings/settings-data";
import type { SettingsShellData } from "@/components/admin/settings-shell";
import {
  buildPeopleDirectoryData,
  buildPeoplePipelineData,
  type PeopleReads,
} from "@/components/admin/people/people-data";
import type {
  PeopleManagementData,
  PeoplePipelineData,
} from "@/components/admin/people-management-shell";
import {
  buildLeaderPipelineData,
  type LeaderPipelineData,
  type LeaderPipelineReads,
} from "@/components/admin/leader-pipeline/leader-pipeline-data";
import type { AdminFollowUpEntry } from "@/lib/supabase/follow-up-reads";
import type { GuestDirectoryEntry } from "@/lib/supabase/guest-reads";
import type { GroupRef } from "@/lib/supabase/group-reads";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { HealthRubricRow } from "@/lib/supabase/rubric-grade-reads";
import type {
  LeaderPipelineEntry,
  ReadinessRuleRow,
} from "@/lib/supabase/multiplication-reads";
import {
  DEMO_GROUPS,
  DEMO_LEADERS,
  DEMO_MEMBERSHIPS,
  DEMO_METRIC_DEFAULTS_ROW,
  DEMO_METRIC_SETTINGS,
  DEMO_PROFILES,
} from "@/lib/dashboard/demo-seed";
import {
  group,
  membership,
  profile,
  settings,
} from "@/lib/dashboard/group-fixtures";
import type { MembersRow } from "@/types/database";

const STAMP = "2026-05-18T12:00:00Z";

function ok<T>(data: T): Promise<ReadResult<T>> {
  return Promise.resolve({ data, error: null });
}

function fail<T>(message: string): Promise<ReadResult<T>> {
  return Promise.resolve({ data: null, error: new Error(message) });
}

// ---------------------------------------------------------------------------
// Follow-ups (admin queue). A small deterministic queue so the surface renders
// rows rather than the empty state; the empty variant proves the "No follow-ups
// yet" state is replaced (not left stale) while the create drawer is open
// (#267).
// ---------------------------------------------------------------------------

// Fixed "today" for the demo queue so the 2026-05-20 due date renders the
// Overdue badge deterministically, independent of when the harness runs.
const DEMO_FOLLOW_UPS_TODAY_ISO = "2026-06-01";

const FOLLOW_UP_QUEUE: AdminFollowUpEntry[] = [
  {
    id: "afu-1",
    type: "guest",
    title: "Reach out to Skyler about placement",
    related_group_id: null,
    related_member_id: null,
    related_guest_id: "guest-skyler",
    assigned_to: "admin-1",
    priority: "high",
    due_date: "2026-05-20",
    status: "open",
    leader_visible_note: null,
    admin_private_note: null,
    created_at: STAMP,
  },
  {
    id: "afu-2",
    type: "leader",
    title: "Confirm Anderson apprentice plan",
    related_group_id: DEMO_GROUPS[0]?.id ?? null,
    related_member_id: null,
    related_guest_id: null,
    assigned_to: null,
    priority: "normal",
    due_date: null,
    status: "in_progress",
    leader_visible_note: null,
    admin_private_note: null,
    created_at: STAMP,
  },
];

const FOLLOW_UP_MEMBERS: MembersRow[] = [
  {
    id: "mem-1",
    full_name: "Jordan Avery",
    email: null,
    phone: null,
    household_name: null,
    status: "active",
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
];

const FOLLOW_UP_GUESTS: GuestDirectoryEntry[] = [
  {
    id: "guest-skyler",
    full_name: "Skyler Monroe",
    email: null,
    phone: null,
    first_attended_group_id: null,
    first_attended_date: null,
    pipeline_stage: "new",
    assigned_group_id: null,
    follow_up_owner_id: null,
    notes: null,
    created_at: STAMP,
  },
];

function demoFollowUpsReads(
  overrides: Partial<AdminFollowUpsReads> = {}
): AdminFollowUpsReads {
  return {
    fetchFollowUpsForAdmin: () => ok(FOLLOW_UP_QUEUE),
    fetchAllGroups: () => ok(DEMO_GROUPS),
    fetchAllMembers: () => ok(FOLLOW_UP_MEMBERS),
    fetchGuests: () => ok(FOLLOW_UP_GUESTS),
    fetchProfilesForAdmin: () => ok(DEMO_PROFILES),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Settings. Rows chosen so the builder derives today's rendered values: live
// defaults, the #478 manual health-status override row (the "Needs follow-up"
// canonical label), saved rubrics that decode to the demo criteria, the
// group-type list, and a readiness rule that decodes cleanly (no fell-back
// notice). The failing variant fails exactly the four reads the #469 spec
// toggles, so the error split renders through the builder's REAL degrade path.
// ---------------------------------------------------------------------------

const GROUP_RUBRIC_ROW: HealthRubricRow = {
  id: "demo-rubric-group",
  kind: "group",
  criteria: [
    { key: "attendance", label: "Attendance", weight: 60 },
    { key: "unity", label: "Unity", weight: 40 },
  ],
  updated_at: STAMP,
};

const LEADER_RUBRIC_ROW: HealthRubricRow = {
  id: "demo-rubric-leader",
  kind: "leader",
  criteria: [
    { key: "walk", label: "Walk with God", weight: 50 },
    { key: "team", label: "Team development", weight: 50 },
  ],
  updated_at: STAMP,
};

const READINESS_RULE_ROW: ReadinessRuleRow = {
  id: "demo-readiness-rule",
  ministry_year: 2026,
  rule: {
    interest: { required: true, min: 3 },
    capacity: { required: true },
    groupHealth: { required: false, min: "C" },
    leaderHealth: { required: false, min: "C" },
    memberCount: { required: false, min: 12 },
    groupTenure: { required: false, min: 3 },
    coShepherdTenure: { required: false, min: 1 },
  },
  updated_at: STAMP,
};

function demoSettingsReads(
  overrides: Partial<SettingsReads> = {}
): SettingsReads {
  return {
    fetchMetricDefaults: () => ok(DEMO_METRIC_DEFAULTS_ROW),
    fetchAllGroups: () => ok(DEMO_GROUPS),
    // #478 (P2.2): one extra row with a manual health-status override (kept out
    // of the shared DEMO_METRIC_SETTINGS so the dashboard demo seed's health
    // buckets stay untouched), so the "Currently overridden" summary's
    // canonical status label is in the tree for the spec.
    fetchAllGroupMetricSettings: () =>
      ok([
        ...DEMO_METRIC_SETTINGS,
        settings({
          group_id: "fb-cap-ok-1",
          manual_health_status_override: "needs_follow_up",
        }),
      ]),
    fetchGroupTypes: () => ok(["Men's", "Women's", "Married Couples"]),
    fetchGroupHealthRubric: () => ok<HealthRubricRow | null>(GROUP_RUBRIC_ROW),
    fetchLeaderHealthRubric: () =>
      ok<HealthRubricRow | null>(LEADER_RUBRIC_ROW),
    fetchReadinessRule: () => ok<ReadinessRuleRow | null>(READINESS_RULE_ROW),
    ...overrides,
  };
}

// #469: the same builder with exactly the four section reads the spec's toggle
// used to simulate as failed. Unlike the old hand-typed payload (healthy data
// with error strings bolted on), the builder now derives the genuinely degraded
// shape: empty rubric criteria, no saved-rubric flag, fallback readiness rule.
function failingSettingsReads(): SettingsReads {
  return demoSettingsReads({
    fetchGroupHealthRubric: () => fail("read failed"),
    fetchLeaderHealthRubric: () => fail("read failed"),
    fetchGroupTypes: () => fail("read failed"),
    fetchReadinessRule: () => fail("read failed"),
  });
}

// ---------------------------------------------------------------------------
// People (directory / apprentices). The dashboard demo seed is all leaders, so
// the directory adds one profile per remaining ladder rung (every role section
// heading in the DOM) and two member records (the seed has none). The pipeline
// seeds one active group with one apprentice + member options so the add form
// and an apprentice row render (an empty availableGroups would hide the form).
// ---------------------------------------------------------------------------

const HARBOR_GROUP_ID = "people-group-1";

const PEOPLE_MEMBERS: MembersRow[] = [
  {
    id: "people-mem-1",
    full_name: "Jordan Avery",
    email: null,
    phone: null,
    household_name: null,
    status: "active",
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
  {
    id: "people-mem-2",
    full_name: "Riley Chen",
    email: "riley@example.test",
    phone: null,
    household_name: null,
    status: "active",
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
];

const PEOPLE_PROFILES = [
  ...DEMO_PROFILES,
  profile({
    id: "people-ma",
    full_name: "Maya Whitfield",
    role: "ministry_admin",
  }),
  profile({
    id: "people-os",
    full_name: "Omar Castillo",
    role: "over_shepherd",
  }),
  profile({ id: "people-co", full_name: "Cora Nguyen", role: "co_leader" }),
];

const PEOPLE_PIPELINE_ENTRIES: LeaderPipelineEntry[] = [
  {
    apprentice: {
      id: "people-appr-1",
      group_id: HARBOR_GROUP_ID,
      display_name: "Jordan Avery",
      member_id: "people-mem-1",
      readiness_stage: "in_training",
      expected_ready_on: null,
      notes: null,
      archived_at: null,
      created_by: null,
      updated_by: null,
      created_at: STAMP,
      updated_at: STAMP,
    },
    groupName: "Harbor Group",
  },
];

// Only the pipeline's group is an active GroupRef, so the rollup's gap list
// stays empty and the member-link dropdown offers exactly Harbor Group — the
// dashboard seed groups feed the directory via fetchAllGroups, not the rollup.
const PEOPLE_GROUP_REFS: GroupRef[] = [
  {
    id: HARBOR_GROUP_ID,
    name: "Harbor Group",
    lifecycle_status: "active",
    group_type: null,
  },
];

function demoPeopleReads(): PeopleReads {
  return {
    fetchProfilesForAdmin: () => ok(PEOPLE_PROFILES),
    fetchAllMembers: () => ok(PEOPLE_MEMBERS),
    // Harbor Group joins the directory's group list so the pipeline group and
    // its memberships aren't orphan references there.
    fetchAllGroups: () =>
      ok([
        ...DEMO_GROUPS,
        group({ id: HARBOR_GROUP_ID, name: "Harbor Group" }),
      ]),
    fetchGroupRefs: () => ok(PEOPLE_GROUP_REFS),
    fetchAllGroupLeaders: () => ok(DEMO_LEADERS),
    fetchActiveMemberships: () =>
      ok([
        ...DEMO_MEMBERSHIPS,
        membership({
          id: "people-ms-1",
          group_id: HARBOR_GROUP_ID,
          member_id: "people-mem-1",
        }),
        membership({
          id: "people-ms-2",
          group_id: HARBOR_GROUP_ID,
          member_id: "people-mem-2",
        }),
      ]),
    fetchLeaderPipeline: () => ok(PEOPLE_PIPELINE_ENTRIES),
    // Unused by the directory/pipeline builders (they feed buildPeopleNeedsContact,
    // which the harness renders as an empty client-side set) — benign empties.
    fetchActiveCoverageAssignments: () => ok([]),
    fetchMetricDefaults: () => ok(null),
    fetchAttentionBaselines: () => ok([]),
    fetchShepherdCareDirectory: () => ok([]),
  };
}

// ---------------------------------------------------------------------------
// Multiply Shepherds tab (#815): the same LeaderPipeline the People surface
// embeds, standalone with its own id namespace. Two apprentices at the SAME
// stage so the repeated Advance / Edit controls must stay unique by name, plus
// one group with no apprentice for the gap list.
// ---------------------------------------------------------------------------

const MULTIPLY_SHEPHERD_GROUP_REFS: GroupRef[] = [
  {
    id: "ms-group-1",
    name: "Riverside Men",
    lifecycle_status: "active",
    group_type: null,
  },
  {
    id: "ms-group-2",
    name: "Harbor Women",
    lifecycle_status: "active",
    group_type: null,
  },
  {
    id: "ms-group-3",
    name: "Kingsway Couples",
    lifecycle_status: "active",
    group_type: null,
  },
];

const MULTIPLY_SHEPHERD_ENTRIES: LeaderPipelineEntry[] = [
  {
    apprentice: {
      id: "ms-appr-1",
      group_id: "ms-group-1",
      display_name: "Miguel Torres",
      member_id: "ms-mem-1",
      readiness_stage: "in_training",
      expected_ready_on: "2026-09-01",
      notes: null,
      archived_at: null,
      created_by: null,
      updated_by: null,
      created_at: STAMP,
      updated_at: STAMP,
    },
    groupName: "Riverside Men",
  },
  {
    apprentice: {
      id: "ms-appr-2",
      group_id: "ms-group-2",
      display_name: "Dana Whitfield",
      member_id: null,
      readiness_stage: "in_training",
      expected_ready_on: null,
      notes: null,
      archived_at: null,
      created_by: null,
      updated_by: null,
      created_at: STAMP,
      updated_at: STAMP,
    },
    groupName: "Harbor Women",
  },
];

const MULTIPLY_SHEPHERD_MEMBERS: MembersRow[] = [
  {
    id: "ms-mem-1",
    full_name: "Miguel Torres",
    email: null,
    phone: null,
    household_name: null,
    status: "active",
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
  {
    id: "ms-mem-2",
    full_name: "Caleb Ruiz",
    email: null,
    phone: null,
    household_name: null,
    status: "active",
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
];

function demoMultiplyShepherdReads(): LeaderPipelineReads {
  return {
    fetchLeaderPipeline: () => ok(MULTIPLY_SHEPHERD_ENTRIES),
    fetchGroupRefs: () => ok(MULTIPLY_SHEPHERD_GROUP_REFS),
    fetchActiveMemberships: () =>
      ok([
        membership({
          id: "ms-ms-1",
          group_id: "ms-group-1",
          member_id: "ms-mem-1",
        }),
        membership({
          id: "ms-ms-2",
          group_id: "ms-group-1",
          member_id: "ms-mem-2",
        }),
      ]),
    fetchAllMembers: () => ok(MULTIPLY_SHEPHERD_MEMBERS),
  };
}

// ---------------------------------------------------------------------------
// The one payload the harness page builds and hands to the client shell.
// ---------------------------------------------------------------------------

export type HarnessDemoData = {
  followUps: AdminFollowUpsData;
  followUpsEmpty: AdminFollowUpsData;
  // Fixed church-local "today" for the follow-up queue surfaces so the demo
  // due dates render deterministic badges (see DEMO_FOLLOW_UPS_TODAY_ISO).
  followUpsTodayIso: string;
  settings: SettingsShellData;
  settingsErrors: SettingsShellData;
  people: PeopleManagementData;
  peoplePipeline: PeoplePipelineData;
  multiplyShepherds: LeaderPipelineData;
};

export async function buildHarnessDemoData(): Promise<HarnessDemoData> {
  const [
    followUps,
    followUpsEmpty,
    settingsData,
    settingsErrors,
    people,
    peoplePipeline,
    multiplyShepherds,
  ] = await Promise.all([
    buildAdminFollowUpsData(demoFollowUpsReads()),
    buildAdminFollowUpsData(
      demoFollowUpsReads({ fetchFollowUpsForAdmin: () => ok([]) })
    ),
    buildSettingsData(demoSettingsReads()),
    buildSettingsData(failingSettingsReads()),
    buildPeopleDirectoryData(demoPeopleReads(), {
      currentActorProfileId: "p-priya",
    }),
    buildPeoplePipelineData(demoPeopleReads()),
    buildLeaderPipelineData(demoMultiplyShepherdReads()),
  ]);

  return {
    followUps,
    followUpsEmpty,
    followUpsTodayIso: DEMO_FOLLOW_UPS_TODAY_ISO,
    settings: settingsData,
    settingsErrors,
    people,
    peoplePipeline,
    multiplyShepherds,
  };
}
