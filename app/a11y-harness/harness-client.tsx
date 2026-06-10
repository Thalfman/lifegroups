"use client";

// Accessibility test harness (issue 257 / Admin Interaction Model req 4).
//
// Renders the real admin repeated-control surfaces with deterministic
// fixtures so the Playwright accessible-name check can prove that repeated
// actions carry record context (group, person, follow-up, or date) — the
// thing axe alone cannot catch (it flags missing names, not present-but-
// ambiguous ones such as a wall of identical "Edit" buttons).
//
// This route only renders when NEXT_PUBLIC_A11Y_HARNESS === "1" (enforced by
// the server page) so it never ships in a normal build. Later surface-
// migration slices add their surface here and inherit the same gate.

import { useState, type ReactNode } from "react";
import { GroupsDirectory } from "@/components/admin/groups-directory";
import {
  CalendarOccurrenceEditor,
  type CalendarOccurrenceEditorActions,
} from "@/components/calendar/calendar-occurrence-editor";
import { AdminMasterCalendarList } from "@/components/admin/admin-master-calendar-list";
import { AdminMasterCalendarGrid } from "@/components/admin/admin-master-calendar-grid";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { FollowUpStatusControls } from "@/components/admin/follow-ups/follow-up-status-controls";
import {
  AdminFollowUpsShell,
  type AdminFollowUpsData,
} from "@/components/admin/follow-ups/follow-ups-shell";
import {
  PeopleManagementShell,
  type PeopleManagementData,
  type PeoplePipelineData,
} from "@/components/admin/people-management-shell";
import { CareFollowUpsSection } from "@/components/admin/shepherd-care/care-follow-ups-section";
import { CareActions } from "@/components/admin/shepherd-care/care-actions";
import { CareLeaderPanel } from "@/components/admin/care/care-leader-panel";
import { NotesFeedShell } from "@/components/admin/care/notes-feed-shell";
import type {
  CareFeedItem,
  SealedLeaderSummary,
} from "@/lib/admin/care-note-feed";
import type { CareAccordionLeader } from "@/lib/admin/care-accordion";
import {
  SettingsShell,
  type SettingsShellData,
} from "@/components/admin/settings-shell";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import {
  ADMIN_FALLBACK,
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";
import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { GroupHealthTriage } from "@/components/lg/admin/group-health-triage";
import { SuperAdminCollapsibleSection } from "@/components/admin/super-admin-collapsible-section";
import { SuperAdminSectionAnchors } from "@/components/admin/super-admin-section-anchors";
import { Sidebar } from "@/components/lg/shell/Sidebar";
import { adminNavGroups } from "@/lib/auth/roles";
import { NAV_ALIAS_TO_CANONICAL } from "@/lib/nav/active-nav";
import { P } from "@/lib/pastoral";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import {
  DEMO_GROUPS,
  DEMO_LEADERS,
  DEMO_MEMBERSHIPS,
  DEMO_METRIC_DEFAULTS,
  DEMO_METRIC_SETTINGS,
  DEMO_PROFILES,
  DEMO_SELECTED_WEEK,
  DEMO_SESSIONS,
} from "@/lib/dashboard/demo-seed";
import { group, settings } from "@/lib/dashboard/group-fixtures";
import type {
  MasterCalendarGroupSummary,
  MasterCalendarLeader,
  MasterOccurrence,
} from "@/lib/admin/master-calendar";
import type { ShepherdCareFollowUpsRow } from "@/types/database";
import type { ResolvedOccurrence } from "@/lib/calendar/occurrences";
import type { ActionResult } from "@/lib/shared/action-result";

const STAMP = "2026-05-18T12:00:00Z";

// Mock server actions for the per-group calendar grid. The harness only
// exercises accessible names on the cell edit triggers (#322), not the
// save/clear round trips, so these never run — they exist to satisfy the
// editor's action props.
const NOOP_CALENDAR_ACTION = async (): Promise<
  ActionResult<{ id: string }>
> => ({
  ok: true,
  value: { id: "noop" },
});
const CALENDAR_GRID_ACTIONS: CalendarOccurrenceEditorActions = {
  create: NOOP_CALENDAR_ACTION,
  update: NOOP_CALENDAR_ACTION,
  archive: NOOP_CALENDAR_ACTION,
};

// A weekly group recurs on every Tuesday of May 2026, so the SAME group's edit
// triggers repeat across multiple dates: their accessible names must stay
// unique (disambiguated by date), and a scheduled study + an OFF week + a
// special social keep the type/status discriminators in the name meaningful.
const GROUP_GRID_OCCURRENCES: ResolvedOccurrence[] = [
  {
    date: "2026-05-05",
    meetingTime: "18:30",
    isMeetingOccurrence: true,
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
  },
  {
    date: "2026-05-12",
    meetingTime: "18:30",
    isMeetingOccurrence: true,
    eventType: "off",
    status: "off",
    title: null,
    description: null,
    overrideId: "grid-ov-1",
  },
  {
    date: "2026-05-19",
    meetingTime: "18:30",
    isMeetingOccurrence: true,
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
  },
  {
    date: "2026-05-26",
    meetingTime: "18:30",
    isMeetingOccurrence: false,
    eventType: "social",
    status: "scheduled",
    title: "Cookout",
    description: null,
    overrideId: "grid-ov-2",
  },
];

// Active paths exercised by the sidebar-active-state surface (#321): the
// default-VISIBLE area roots (Care/Plan/Multiply pivot, ADR 0016) plus every
// frozen alias URL. The alias keys come from the resolver's own map so the
// harness can't drift from the source of truth. The default-hidden tabs
// (Groups/People/Planning) aren't rendered in the default sidebar, so their
// roots aren't asserted here — their alias owners (now Care/Multiply/Plan) are.
const SIDEBAR_ACTIVE_PATHS = [
  "/admin",
  "/admin/care",
  "/admin/plan",
  "/admin/multiply",
  "/admin/settings",
  ...Object.keys(NAV_ALIAS_TO_CANONICAL),
] as const;

function occurrence(
  groupName: string,
  groupId: string,
  date: string,
  leaderName = "Pat Lee"
): MasterOccurrence {
  return {
    groupId,
    groupName,
    lifecycleStatus: "active",
    meetingDay: "Tuesday",
    meetingTime: "19:00",
    meetingFrequency: "weekly",
    meetingWeekParity: null,
    leaders: [{ profileId: `${groupId}-l`, name: leaderName }],
    date,
    weekdayIndex: 2,
    inheritedMeetingTime: "19:00",
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
    isGenerated: true,
    isMeetingOccurrence: true,
  };
}

const OCCURRENCES: MasterOccurrence[] = [
  // Anderson is a weekly group: the SAME group recurs on multiple dates in the
  // month, so its calendar links must be disambiguated by date, not collide.
  occurrence("Anderson", "grp-anderson", "2026-05-19"),
  occurrence("Anderson", "grp-anderson", "2026-05-26"),
  occurrence("Bryant", "grp-bryant", "2026-05-19"),
  occurrence("Carter", "grp-carter", "2026-05-26"),
  // Two DIFFERENT groups that share the same display name AND the same date,
  // type, time, and status — group names are not unique. Only the leader
  // discriminator in the accessible name keeps these occurrence triggers
  // distinct, which is exactly the collision the name builder must guard. They
  // sit on their own date (May 12) so both pills stay under the grid's per-cell
  // cap and the month-grid view exercises the collision too.
  occurrence("Sunday Night", "grp-sun-a", "2026-05-12", "Dana Cole"),
  occurrence("Sunday Night", "grp-sun-b", "2026-05-12", "Sam Reed"),
];

// Group + leader fixtures for the master-calendar filter shell (#262). Distinct
// names so the filter chips and the leader select render readable labels.
const CALENDAR_GROUPS: MasterCalendarGroupSummary[] = [
  "grp-anderson",
  "grp-bryant",
  "grp-carter",
].map((groupId) => ({
  groupId,
  groupName: groupId.replace("grp-", "").replace(/^./, (c) => c.toUpperCase()),
  lifecycleStatus: "active",
  meetingDay: "Tuesday",
  meetingTime: "19:00",
  meetingFrequency: "weekly",
  meetingWeekParity: null,
  leaders: [{ profileId: `${groupId}-l`, name: "Pat Lee" }],
}));

const CALENDAR_LEADERS: MasterCalendarLeader[] = [
  { profileId: "grp-anderson-l", name: "Pat Lee" },
  { profileId: "grp-bryant-l", name: "Sam Rivers" },
];

// Two active groups that share a display name (group names are not unique in
// the data model). Their row actions must stay distinguishable via the
// meeting-area discriminator.
const COLLISION_GROUPS = [
  group({ id: "grp-ya-north", name: "Young Adults", location_area: "North" }),
  group({ id: "grp-ya-south", name: "Young Adults", location_area: "South" }),
];

// Care accordion leader panels (#467): the per-Leader panel from the canonical
// /admin/care Over-Shepherds view, now hosting the inline transparency toggle.
// One sealed Leader and one granted Leader (with counts) so the care-actions
// spec can assert the toggle's leader-contextual accessible name in both
// states, that the panel stays counts-only (never note bodies), and the
// pending state while a flip is in flight.
const CARE_PANEL_LEADER_SEALED: CareAccordionLeader = {
  profileId: "00000000-0000-4000-8000-0000000000a1",
  fullName: "Anderson Lee",
  groupNames: ["Anderson"],
  ledGroups: [{ id: "grp-anderson", name: "Anderson", healthGrade: "B" }],
  careStatus: "doing_well",
  lastContactAt: "2026-05-12",
  nextStepDue: "2026-05-26",
  leaderHealthGrade: "A",
  notes: { transparency: "sealed", careNoteCount: 0, prayerCount: 0 },
};

const CARE_PANEL_LEADER_GRANTED: CareAccordionLeader = {
  profileId: "00000000-0000-4000-8000-0000000000a2",
  fullName: "Bryant Cole",
  groupNames: ["Bryant"],
  ledGroups: [{ id: "grp-bryant", name: "Bryant", healthGrade: "C" }],
  careStatus: "needs_follow_up",
  lastContactAt: "2026-05-05",
  nextStepDue: "2026-05-20",
  leaderHealthGrade: "B",
  notes: { transparency: "visible", careNoteCount: 2, prayerCount: 1 },
};

// All Notes feed fixtures (ADR 0023): one of each feed kind so the spec can
// assert the kind badges, context lines, and labelled filters; two sealed
// leaders so the repeated transparency toggles must carry leader context.
const NOTES_FEED_ITEMS: CareFeedItem[] = [
  {
    kind: "care_note",
    id: "note-1",
    body: "Checked in after the move — settling in well.",
    occurredAt: "2026-06-03T10:00:00+00:00",
    authorProfileId: "00000000-0000-4000-8000-0000000000b1",
    authorName: "Omar Shepherd",
    viewerAuthored: false,
    subjectKind: "leader",
    subjectId: "00000000-0000-4000-8000-0000000000a1",
    subjectName: "Anderson Lee",
  },
  {
    kind: "prayer_request",
    id: "prayer-1",
    body: "Pray for the group's new families.",
    occurredAt: "2026-06-02T10:00:00+00:00",
    authorProfileId: "00000000-0000-4000-8000-0000000000a2",
    authorName: "Bryant Cole",
    viewerAuthored: false,
    subjectKind: "group",
    subjectId: "grp-bryant",
    subjectName: "Bryant",
    prayerStatus: "answered",
  },
  {
    kind: "broad_note",
    id: "broad-1",
    body: "Grabbed coffee, doing well.",
    occurredAt: "2026-06-01",
    authorProfileId: "00000000-0000-4000-8000-0000000000c1",
    authorName: "Julian Admin",
    viewerAuthored: true,
    subjectKind: "leader",
    subjectId: "00000000-0000-4000-8000-0000000000a1",
    subjectName: "Anderson Lee",
  },
];

const NOTES_FEED_SEALED: SealedLeaderSummary[] = [
  {
    profileId: "00000000-0000-4000-8000-0000000000a1",
    name: "Anderson Lee",
    careNoteCount: 2,
    prayerRequestCount: 1,
  },
  {
    profileId: "00000000-0000-4000-8000-0000000000a2",
    name: "Bryant Cole",
    careNoteCount: 0,
    prayerRequestCount: 2,
  },
];

const CARE_FOLLOW_UPS: ShepherdCareFollowUpsRow[] = [
  // Two follow-ups with the SAME title and status: titles are not unique, so
  // the due date must keep their action buttons distinguishable.
  {
    id: "care-fu-1",
    care_profile_id: "care-1",
    title: "Call Anderson about apprentice",
    due_date: "2026-05-22",
    status: "open",
    notes: null,
    created_by_profile_id: "admin-1",
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
    archived_at: null,
  },
  {
    id: "care-fu-2",
    care_profile_id: "care-1",
    title: "Call Anderson about apprentice",
    due_date: "2026-05-29",
    status: "open",
    notes: null,
    created_by_profile_id: "admin-1",
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
    archived_at: null,
  },
];

// fu-1 and fu-2 share title + status; the due date disambiguates them.
const FOLLOW_UPS = [
  {
    id: "fu-1",
    status: "open" as const,
    title: "Check in with Anderson",
    due_date: "2026-05-20",
  },
  {
    id: "fu-2",
    status: "open" as const,
    title: "Check in with Anderson",
    due_date: "2026-05-27",
  },
  {
    id: "fu-3",
    status: "in_progress" as const,
    title: "Confirm Bryant launch",
    due_date: null,
  },
];

// Admin Follow-ups surface (#267, Admin Interaction Model req 1). Proves the
// validated Editing Pattern propagated to Follow-up creation: the queue renders
// no full inline create form, "Add follow-up" opens the shared EditingSurface
// drawer (focus moves in, Escape / Close close it, focus returns), and the
// queue's filter state survives the round trip. A small deterministic queue so
// the surface renders rows rather than the empty state.
const FOLLOW_UPS_ADMIN_DATA: AdminFollowUpsData = {
  followUps: [
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
  ],
  groups: DEMO_GROUPS,
  members: [
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
  ],
  guests: [
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
  ],
  assigneeProfiles: DEMO_PROFILES,
  errors: {
    followUps: null,
    groups: null,
    members: null,
    guests: null,
    profiles: null,
  },
};

// First-run state: an empty queue. Used to prove the "No follow-ups yet" empty
// state is replaced (not left stale) while the create drawer is open (#267).
const FOLLOW_UPS_EMPTY_DATA: AdminFollowUpsData = {
  ...FOLLOW_UPS_ADMIN_DATA,
  followUps: [],
};

// Settings is req 5 (semantics / grouping / progressive disclosure / labels).
// Unlike the req-4 surfaces above it has no repeated-action collisions to prove;
// it's here so the axe + label-association checks run against the real Settings
// component tree (defaults form, the Advanced-thresholds disclosure, and the
// per-group overrides disclosure with its active-override rows).
// Group health triage surface (#259, Admin Interaction Model req 2). Proves the
// list carries record context (Open {group} health editor), renders no per-row
// save buttons, and that the EditingSurface drawer satisfies the focus/keyboard
// checklist. Rows cover the triage states: fully rated, needs-rating, not
// assessed, and a stale fallback.
const GROUP_HEALTH_ROWS: GroupHealthOverviewRow[] = [
  {
    group_id: "grp-anderson",
    group_name: "Anderson",
    attendance_pct: 82,
    attendance_weeks_counted: 8,
    spiritual_growth_score: 4,
    spiritual_growth_note: "Strong apprentice pipeline.",
    group_question_score: 4,
    group_question_leader_reported: true,
    computed_letter: "B",
    last_check_in_week: "2026-05-25",
    last_saved_at: "2026-05-26T12:00:00Z",
    stale: false,
    unassessed: false,
    // Clean control: a B grade, not declining, no open flag — so it is absent
    // from the Watch and Needs-follow-up filters.
    needs_follow_up: false,
    attendance_declining: false,
  },
  {
    group_id: "grp-bryant",
    group_name: "Bryant",
    attendance_pct: 61,
    attendance_weeks_counted: 6,
    spiritual_growth_score: 3,
    spiritual_growth_note: null,
    group_question_score: null,
    group_question_leader_reported: false,
    computed_letter: "B",
    last_check_in_week: "2026-05-18",
    last_saved_at: "2026-05-19T12:00:00Z",
    stale: false,
    unassessed: false,
    // A B grade (above the Watch threshold) but declining attendance — exercises
    // the Watch filter's decline leg. Not flagged for follow-up.
    needs_follow_up: false,
    attendance_declining: true,
  },
  {
    group_id: "grp-carter",
    group_name: "Carter",
    attendance_pct: null,
    attendance_weeks_counted: 0,
    spiritual_growth_score: null,
    spiritual_growth_note: null,
    group_question_score: null,
    group_question_leader_reported: false,
    computed_letter: null,
    last_check_in_week: null,
    last_saved_at: null,
    stale: false,
    unassessed: true,
    needs_follow_up: false,
    attendance_declining: false,
  },
  {
    // Stale fallback: the live attendance read failed, so we show the last
    // persisted snapshot flagged "stale" with no fresh check-in week.
    group_id: "grp-dawson",
    group_name: "Dawson",
    attendance_pct: 74,
    attendance_weeks_counted: 8,
    spiritual_growth_score: 3,
    spiritual_growth_note: null,
    group_question_score: 3,
    group_question_leader_reported: false,
    computed_letter: "C",
    last_check_in_week: null,
    last_saved_at: "2026-05-10T12:00:00Z",
    stale: true,
    unassessed: false,
    // A C grade (at the Watch threshold) with an open follow-up flag — the one
    // group on both the Watch and Needs-follow-up filters.
    needs_follow_up: true,
    attendance_declining: false,
  },
];

const SETTINGS_DATA: SettingsShellData = {
  defaults: DEMO_METRIC_DEFAULTS,
  defaultsSource: "live",
  groups: DEMO_GROUPS,
  // #478 (P2.2): one extra row with a manual health-status override (kept out
  // of the shared DEMO_METRIC_SETTINGS so the dashboard demo seed's health
  // buckets stay untouched), so the "Currently overridden" summary's canonical
  // status label ("Needs follow-up", never de-underscored enum text) is in the
  // tree for the spec.
  groupMetricSettings: [
    ...DEMO_METRIC_SETTINGS,
    settings({
      group_id: "fb-cap-ok-1",
      manual_health_status_override: "needs_follow_up",
    }),
  ],
  groupRubricCriteria: [
    { key: "attendance", label: "Attendance", weight: 60 },
    { key: "unity", label: "Unity", weight: 40 },
  ],
  leaderRubricCriteria: [
    { key: "walk", label: "Walk with God", weight: 50 },
    { key: "team", label: "Team development", weight: 50 },
  ],
  // #412 Settings > Groups: the live catalog (id + label) the create flow dedupes
  // against, so the group-type list + "+" add flow is in the tree for the a11y
  // scan.
  groupCategories: [{ id: "cat-1", label: "20-30s" }],
  // The category-picker options per top type for the Groups tab's inline edit
  // drawer; cat-1 is applied under men + women in the coverage rows below.
  categoriesByAudience: {
    men: [{ id: "cat-1", label: "20-30s" }],
    women: [{ id: "cat-1", label: "20-30s" }],
    mixed: [],
  },
  // #400 / #412 Settings > Groups: coverage rows for the two active cat-1 cells —
  // each is a row in the group-type list (its label, target, and live count) for
  // the a11y scan.
  cellCoverage: [
    {
      audienceCategory: "men",
      categoryId: "cat-1",
      label: "20-30s",
      have: 1,
      target: 3,
      gap: 2,
    },
    {
      audienceCategory: "women",
      categoryId: "cat-1",
      label: "20-30s",
      have: 2,
      target: 2,
      gap: 0,
    },
  ],
  // #402 / #410 / #411 Settings > Multiply: the three-tier readiness trigger — the
  // global rule, a per-type (Audience) rule, and one row per active cat-1 cell — so
  // the Multiply tiered trigger editor (the level dropdown + pillar controls) is in
  // the tree for the a11y scan.
  readiness: {
    ministryYear: 2026,
    rule: {
      interest: { required: true, min: 3 },
      capacity: { required: true },
      groupHealth: { required: false, min: "C" },
      leaderHealth: { required: false, min: "C" },
    },
    // #473: demo rule decodes cleanly — no stored-trigger-unreadable notice.
    ruleFellBack: false,
    perType: {
      men: { interest: { required: true, min: 5 } },
    },
    cells: [
      {
        audienceCategory: "men",
        categoryId: "cat-1",
        label: "20-30s",
        override: { interest: { required: true, min: 5 } },
      },
      {
        audienceCategory: "women",
        categoryId: "cat-1",
        label: "20-30s",
        override: {},
      },
    ],
  },
  // Issue #304: render the super_admin variant so the super-admin-only System
  // tab affordances are in the tree for the a11y scan.
  isSuperAdmin: true,
  errors: {
    defaults: null,
    groups: null,
    overrides: null,
    groupRubric: null,
    leaderRubric: null,
    groupCategories: null,
    readiness: null,
  },
};

// #469: the same Settings shell with every section read FAILED, so the spec
// can prove the read-error split: each section renders the calm "couldn't
// load" notice naming its own failing read — never the "not set up yet" copy,
// and never an editor that could overwrite configuration that failed to load.
const SETTINGS_ERRORS_DATA: SettingsShellData = {
  ...SETTINGS_DATA,
  errors: {
    ...SETTINGS_DATA.errors,
    groupRubric: "read failed",
    leaderRubric: "read failed",
    groupCategories: "read failed",
    readiness: "read failed",
  },
};

// Home — the /admin landing (#480). Mounts the real DashboardClient with the
// typed demo seeds the no-client preview renders (the same payload the
// structure tests pin), under the DEFAULT nav flags (Groups / People / Planning
// hidden, ADR 0016) — so the spec asserts the FINAL post-pivot card set: the
// six #476 vital signs, the Care/Plan/Multiply overview cards, and no card or
// link for a retired tab. canResetActivity mounts the Super-Admin
// activity-reset control so its affordances are in the tree for the axe scan
// (mirroring the Settings surface's isSuperAdmin: true).
const HOME_DEFAULT_HIDDEN_NAV = [
  "/admin/groups",
  "/admin/people",
  "/admin/planning",
];

// #480 tone pass: the all-quiet payload — every read succeeded and every count
// is a TRUE zero — so each card renders its empty state and the spec can prove
// the one calm, pastoral voice on the real rendered surface (and run axe over
// the empty renderings). Distinct from `degraded`, which suppresses output.
const HOME_QUIET_DATA: AdminDashboardData = {
  ...ADMIN_FALLBACK,
  summary: { ...ADMIN_FALLBACK.summary, activeGroupCount: 0 },
  attentionItems: [],
  healthSummary: {
    submitted: [],
    missing: [],
    didNotMeet: [],
    plannedPause: [],
    needsFollowUp: [],
    watch: [],
    healthy: [],
    counts: {
      submitted: 0,
      missing: 0,
      did_not_meet: 0,
      planned_pause: 0,
      needs_follow_up: 0,
      watch: 0,
      healthy: 0,
    },
  },
  setupGaps: {
    noCapacity: [],
    noLeader: [],
    noMeetingDayTime: [],
    noMembers: [],
    counts: { noCapacity: 0, noLeader: 0, noMeetingDayTime: 0, noMembers: 0 },
  },
  followUps: [],
  dueFollowUpsThisWeekCount: 0,
  shepherdCare: {
    ...ADMIN_FALLBACK.shepherdCare,
    needsAttention: 0,
    overdueTouchpoints: 0,
    notContactedRecently: 0,
    noCareProfile: 0,
    unassignedCoverage: 0,
    attentionItemsTotal: 0,
  },
  leaderPipeline: {
    counts: { identified: 0, in_training: 0, ready_to_lead: 0, launched: 0 },
    total: 0,
    available: true,
    error: null,
  },
  multiplication: {
    counts: { watching: 0, planned: 0, launched: 0, deferred: 0 },
    total: 0,
    available: true,
    error: null,
  },
};

const HOME_QUIET_FUNNEL: InterestFunnelDashboardSummary = {
  counts: { interested: 0, matched: 0, joined: 0, not_at_this_time: 0 },
  available: true,
  error: null,
};

const HOME_QUIET_READINESS: MultiplyReadinessDashboardSummary = {
  readyCells: 0,
  activeCells: 0,
  available: true,
  error: null,
};

// People surface (#270, Admin Interaction Model req 3). Proves the People page
// defaults to the Directory view, with Add person and Assignments as secondary
// views reached by explicit actions, and that group assignment happens in a
// detail surface (the EditingSurface drawer) rather than repeated inline per
// group. Reuses the dashboard demo seed for the directory + assignment rosters,
// plus a couple of member records (the seed has none).
const PEOPLE_MEMBERS = [
  {
    id: "people-mem-1",
    full_name: "Jordan Avery",
    email: null,
    phone: null,
    household_name: null,
    status: "active" as const,
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
    status: "active" as const,
    care_sensitivity_flag: false,
    created_at: STAMP,
    updated_at: STAMP,
  },
];

const PEOPLE_DATA: PeopleManagementData = {
  currentActorProfileId: "p-priya",
  profiles: DEMO_PROFILES,
  members: PEOPLE_MEMBERS,
  groups: DEMO_GROUPS,
  groupLeaders: DEMO_LEADERS,
  memberships: DEMO_MEMBERSHIPS,
  errors: {
    profiles: null,
    members: null,
    groups: null,
    leaders: null,
    memberships: null,
  },
};

// The Apprentices tab embeds the leader pipeline (issue #302). The empty rollup
// renders the pipeline's empty state — enough for axe to scan the tab's controls.
const PEOPLE_PIPELINE: PeoplePipelineData = {
  rollup: { stages: [], groupsWithoutApprentice: [], totalApprentices: 0 },
  availableGroups: [],
  error: null,
};

const PEOPLE_NEEDS_CONTACT: ReadonlySet<string> = new Set();

// Calendar occurrence editor (#324 a11y hardening sweep). The Groups calendar
// modal is its own Radix Dialog (separate from the EditingSurface drawer), opened
// from a programmatic trigger rather than a DialogTrigger, and it carries the
// "Clear override" destructive action. It is mounted here so the a11y suite can
// pin its accessible name, focus trap/restore, Escape/Close behaviour, and the
// keyboard-operability of the clear-override action. The stub actions never run
// (the suite only opens the modal); they satisfy the action-form contract.
const CALENDAR_EDITOR_ACTIONS: CalendarOccurrenceEditorActions = {
  create: async () => ({ ok: true as const, value: { id: "occ-1" } }),
  update: async () => ({ ok: true as const, value: { id: "occ-1" } }),
  archive: async () => ({ ok: true as const, value: { id: "occ-1" } }),
};

function Surface({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section
      data-a11y-surface={id}
      style={{ display: "grid", gap: 12, marginBottom: 40 }}
    >
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

export function A11yHarnessClient() {
  const [, setSelected] = useState<MasterOccurrence | null>(null);
  // #469: whether the Settings surface renders the read-error payload.
  const [settingsReadErrors, setSettingsReadErrors] = useState(false);
  // #480: whether the Home surface renders the all-quiet (empty-state) payload.
  const [homeQuiet, setHomeQuiet] = useState(false);
  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1>Admin accessible-name harness</h1>

      <Surface id="groups-directory" heading="Groups directory">
        <GroupsDirectory
          groups={DEMO_GROUPS}
          groupLeaders={DEMO_LEADERS}
          profiles={DEMO_PROFILES}
          memberships={DEMO_MEMBERSHIPS}
          latestSessions={DEMO_SESSIONS}
          latestWeek={DEMO_SELECTED_WEEK}
          metricDefaults={DEMO_METRIC_DEFAULTS}
          groupMetricSettings={DEMO_METRIC_SETTINGS}
          healthGradesByGroupId={{}}
          healthSignalsByGroupId={{}}
          watchGrade={DEMO_METRIC_DEFAULTS.group_health_watch_grade}
        />
      </Surface>

      <Surface
        id="groups-directory-collisions"
        heading="Groups directory (same-name collision)"
      >
        <GroupsDirectory
          groups={COLLISION_GROUPS}
          groupLeaders={[]}
          profiles={[]}
          memberships={[]}
          latestSessions={[]}
          latestWeek={null}
          metricDefaults={DEMO_METRIC_DEFAULTS}
          groupMetricSettings={[]}
          healthGradesByGroupId={{}}
          healthSignalsByGroupId={{}}
          watchGrade={DEMO_METRIC_DEFAULTS.group_health_watch_grade}
        />
      </Surface>

      <Surface id="master-calendar-list" heading="Master calendar (list)">
        <AdminMasterCalendarList
          occurrences={OCCURRENCES}
          fromIso="2026-05-01"
          toIso="2026-05-31"
          anchorDate={null}
          onAnchorConsumed={() => {}}
          onSelect={setSelected}
        />
      </Surface>

      {/* Master calendar month grid (#322). The per-day occurrence pills are
          <button>s whose accessible name must summarize the occurrence ("View
          Anderson on Tuesday, May 19 — Study, 7:00 PM") rather than read as the
          concatenated child text. Two groups share May 19 and May 26, so the
          same-date collision is real and the uniqueness gate is meaningful. */}
      <Surface id="master-calendar-grid" heading="Master calendar (month grid)">
        <AdminMasterCalendarGrid
          monthIso="2026-05"
          todayIso="2026-05-18"
          occurrences={OCCURRENCES}
          onSelect={setSelected}
          onMoreFromDay={() => {}}
        />
      </Surface>

      {/* Master calendar filter shell (#262, Admin Interaction Model req 11).
          Mounts the real FilterBar so axe runs against the polish controls:
          the per-field Select all / Clear all pairs and the removable active-
          filter chips, each of which must carry a discernible accessible name
          ("Select all Status", "Remove filter: Anderson"). */}
      <Surface id="master-calendar-filters" heading="Master calendar (filters)">
        <AdminMasterCalendarShell
          monthIso="2026-05"
          todayIso="2026-05-18"
          occurrences={OCCURRENCES}
          groups={CALENDAR_GROUPS}
          leaderOptions={CALENDAR_LEADERS}
        />
      </Surface>

      {/* Planning opinionated views (#331, #371). The same shell with the
          Planning opt-in: the primary quick filters (This week / Needs coverage
          / Cancelled-OFF / By leader) as mutually-exclusive aria-pressed toggle
          buttons, the advanced filters in a collapsible disclosure, an
          active-filter summary + Clear filters control, and de-noised per-group
          calendar links. axe runs against the quick-filter group, the labelled
          advanced-filter checkboxes, the disclosure, and the By-leader layout's
          single per-group link. */}
      <Surface
        id="planning-opinionated-views"
        heading="Planning (opinionated views)"
      >
        <AdminMasterCalendarShell
          monthIso="2026-05"
          todayIso="2026-05-18"
          occurrences={OCCURRENCES}
          groups={CALENDAR_GROUPS}
          leaderOptions={CALENDAR_LEADERS}
          defaultViewMode="list"
          persistSurface="planning-calendar-harness"
          showLegendAlways
          planningViews
        />
      </Surface>

      {/* Calendar occurrence editor (#324). A saved-override occurrence so the
          modal renders the destructive "Clear override" action. It opens the
          Radix Dialog from a programmatic (non-DialogTrigger) button — the case
          the a11y suite pins for focus trap + restore. */}
      <Surface
        id="calendar-occurrence-editor"
        heading="Calendar occurrence editor"
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <CalendarOccurrenceEditor
            groupId="grp-anderson"
            groupMeetingTime="19:00"
            occurrence={{
              date: "2026-05-19",
              meetingTime: "19:00",
              eventType: "study",
              status: "scheduled",
              title: "Week 3 of the rotation",
              description: null,
              overrideId: "override-1",
              isMeetingOccurrence: true,
            }}
            actions={CALENDAR_EDITOR_ACTIONS}
            triggerLabel="Edit Anderson occurrence on May 19"
            canEdit
          />
        </div>
      </Surface>

      {/* Per-group calendar month grid (#322). Each editable cell renders a
          <button> whose accessible name must be an explicit, meaningful summary
          ("Edit Tuesday, May 5 — Study, 6:30 PM, Scheduled" / "Add event on
          …") rather than the concatenated child text. A weekly group recurring
          on multiple Tuesdays makes the same-group/different-date collision
          real, so the uniqueness gate is meaningful. */}
      <Surface
        id="calendar-month-grid"
        heading="Calendar month grid (per group)"
      >
        <CalendarMonthGrid
          monthIso="2026-05"
          todayIso="2026-05-18"
          occurrences={GROUP_GRID_OCCURRENCES}
          groupId="00000000-0000-4000-8000-000000000002"
          groupMeetingTime="18:30"
          actions={CALENDAR_GRID_ACTIONS}
          canEdit
        />
      </Surface>

      <Surface id="follow-up-status" heading="Follow-up status controls">
        <div style={{ display: "grid", gap: 16 }}>
          {FOLLOW_UPS.map((fu) => (
            <div key={fu.id}>
              <p>{fu.title}</p>
              <FollowUpStatusControls followUp={fu} />
            </div>
          ))}
        </div>
      </Surface>

      <Surface
        id="people"
        heading="People (directory / leaders / members / apprentices / add)"
      >
        <PeopleManagementShell
          data={PEOPLE_DATA}
          pipeline={PEOPLE_PIPELINE}
          needsContactProfileIds={PEOPLE_NEEDS_CONTACT}
        />
      </Surface>

      <Surface id="follow-ups" heading="Follow-ups (admin queue)">
        <AdminFollowUpsShell data={FOLLOW_UPS_ADMIN_DATA} />
      </Surface>

      <Surface id="follow-ups-empty" heading="Follow-ups (empty queue)">
        <AdminFollowUpsShell data={FOLLOW_UPS_EMPTY_DATA} />
      </Surface>

      {/* Leader care follow-ups (#268, Admin Interaction Model req 1). Proves
          the validated Editing Pattern propagated to care follow-up creation:
          the list renders no inline create form, "Add follow-up" opens the
          shared EditingSurface drawer, and the per-row status quick-actions
          still carry record context (the accessible-name suite checks both the
          status-button uniqueness here and the no-bare-name invariant). */}
      <Surface id="care-follow-ups" heading="Shepherd care follow-ups">
        <CareFollowUpsSection
          careProfileId="care-1"
          shepherdProfileId="care-1"
          followUps={CARE_FOLLOW_UPS}
          todayIso="2026-05-18"
          leaderName="Anderson Lee"
        />
      </Surface>

      {/* First-run state: an empty care follow-up list, to prove the empty
          prompt is replaced (not left stale) while the create drawer is open. */}
      <Surface
        id="care-follow-ups-empty"
        heading="Shepherd care follow-ups (empty)"
      >
        <CareFollowUpsSection
          careProfileId="care-1"
          shepherdProfileId="care-1"
          followUps={[]}
          todayIso="2026-05-18"
          leaderName="Anderson Lee"
        />
      </Surface>

      {/* Leader care actions, redesigned as plain separate choices (#272,
          Admin Interaction Model req 10). Each choice opens a focused Editing
          Pattern drawer doing one thing; the buttons carry distinct,
          non-generic names and the drawer's Close control carries leader
          context. */}
      <Surface id="care-actions" heading="Leader care actions (redesigned)">
        <CareActions
          shepherdProfileId="00000000-0000-4000-8000-000000000001"
          current={null}
          leaderName="Anderson Lee"
        />
      </Surface>

      {/* Care accordion leader panels (#467). The transparency toggle moved
          inline into the accordion's Care Notes & Prayer slot: a sealed
          Leader renders the interactive toggle (off), a granted Leader keeps
          the counts-only line next to the seal control. Both toggles must
          carry the Leader's name in their accessible names since the control
          repeats per Leader. */}
      <Surface
        id="care-accordion-panel"
        heading="Care accordion (leader panels)"
      >
        <CareLeaderPanel leader={CARE_PANEL_LEADER_SEALED} />
        <CareLeaderPanel leader={CARE_PANEL_LEADER_GRANTED} />
      </Surface>

      {/* All Notes feed (ADR 0023). The Care area's Notes tab: labelled
          filter selects, the readable-notes list (kind badges + context
          lines), and the sealed-summary block whose per-leader transparency
          toggles repeat and so must carry each leader's name. */}
      <Surface id="care-notes-feed" heading="Care notes feed (All Notes)">
        <NotesFeedShell
          items={NOTES_FEED_ITEMS}
          sealedSummary={NOTES_FEED_SEALED}
          feedAvailable
          sealedAvailable
        />
      </Surface>

      <Surface id="group-health" heading="Group health (triage)">
        <GroupHealthTriage
          rows={GROUP_HEALTH_ROWS}
          period="2026-05-01"
          spiritualGrowthLabel="Spiritual growth (1–5)"
          groupQuestionLabel="Group engagement — leader-reported (1–5)"
          watchGrade="C"
        />
      </Surface>

      {/* #469: the toggle swaps the ONE Settings instance to the read-error
          payload (a second mounted shell would duplicate the tablist's
          settings-tab-* ids and trip axe's duplicate-id-aria). It sits outside
          the surface so the settings-scoped scans see nothing new; the spec
          clicks it, then asserts each section's "couldn't load" notice. The
          key remounts the tabs so the swap lands back on the Care tab. */}
      <button
        type="button"
        data-testid="settings-read-errors-toggle"
        aria-pressed={settingsReadErrors}
        onClick={() => setSettingsReadErrors((v) => !v)}
      >
        Simulate settings read failures
      </button>
      <Surface
        id="settings"
        heading="Settings (rubrics, thresholds, overrides)"
      >
        <SettingsShell
          key={settingsReadErrors ? "read-errors" : "healthy"}
          data={settingsReadErrors ? SETTINGS_ERRORS_DATA : SETTINGS_DATA}
        />
      </Surface>

      {/* Home — the /admin landing (#480). ONE instance only: DashboardClient
          renders fixed section ids (home-needs-attention, exec-vital-signs, …),
          so a second mounted copy would duplicate ids and trip axe. The toggle
          (outside the surface, like the Settings one) swaps the instance to the
          all-quiet payload so the spec can assert the unified empty-state voice
          and run axe over the empty renderings; the key remount resets the
          collapsible overview's open state. */}
      <button
        type="button"
        data-testid="home-quiet-toggle"
        aria-pressed={homeQuiet}
        onClick={() => setHomeQuiet((v) => !v)}
      >
        Simulate an all-quiet Home
      </button>
      <Surface id="home" heading="Home (admin landing)">
        <DashboardClient
          key={homeQuiet ? "quiet" : "demo"}
          data={homeQuiet ? HOME_QUIET_DATA : ADMIN_FALLBACK}
          interestFunnel={
            homeQuiet ? HOME_QUIET_FUNNEL : INTEREST_FUNNEL_FALLBACK
          }
          multiplyReadiness={
            homeQuiet ? HOME_QUIET_READINESS : MULTIPLY_READINESS_FALLBACK
          }
          guestsLive={false}
          scopeId={null}
          canResetActivity
          hiddenNavAreas={HOME_DEFAULT_HIDDEN_NAV}
        />
      </Surface>

      {/* Super Admin Console collapsible sections (#261, Admin Interaction
          Model req 9). Proves the operational sections are native <details>
          collapsed by default with working anchors: following a section link
          expands the target section and moves focus to its <summary> heading.
          A high-risk section carries an accent so it reads as visually
          separated from routine controls. The anchor controller is the same
          one the real console mounts. */}
      <Surface id="super-admin-sections" heading="Super Admin Console sections">
        <SuperAdminSectionAnchors />
        <nav aria-label="Super admin sections (harness)">
          <a href="#harness-access">Access</a>
          {" · "}
          <a href="#harness-danger-zone">Danger Zone</a>
        </nav>
        <SuperAdminCollapsibleSection id="harness-access" label="Access">
          <p>Role workflow and profile oversight.</p>
        </SuperAdminCollapsibleSection>
        <SuperAdminCollapsibleSection
          id="harness-danger-zone"
          label="Danger Zone"
          accent={{
            border: P.terra,
            color: P.terraTextStrong,
            badge: (
              <span
                style={{
                  border: `1px solid ${P.terra}`,
                  borderRadius: 999,
                  color: P.terraTextStrong,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  textTransform: "uppercase",
                }}
              >
                Guarded
              </span>
            ),
          }}
        >
          <p>Guarded permanent actions.</p>
        </SuperAdminCollapsibleSection>
      </Surface>

      {/* Sidebar active-state (#321). The real sidebar can't be navigated to a
          frozen alias URL inside the harness (usePathname is fixed to the
          harness route), so each instance is rendered with an explicit
          `activePath` — the canonical area paths plus the six frozen aliases.
          The spec asserts exactly one aria-current="page" per instance and that
          it falls on the area that OWNS the path (alias → canonical). */}
      <Surface id="sidebar-active-state" heading="Sidebar active state">
        <div style={{ display: "grid", gap: 24 }}>
          {SIDEBAR_ACTIVE_PATHS.map((activePath) => (
            <div key={activePath} data-sidebar-active-path={activePath}>
              <h3 style={{ margin: "0 0 8px" }}>{activePath}</h3>
              <Sidebar
                navGroups={adminNavGroups("ministry_admin")}
                activePath={activePath}
                navLabel={`Sidebar @ ${activePath}`}
              />
            </div>
          ))}
        </div>
      </Surface>
    </main>
  );
}
