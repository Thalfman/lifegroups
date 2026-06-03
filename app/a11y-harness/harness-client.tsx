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
import { AdminMasterCalendarList } from "@/components/admin/admin-master-calendar-list";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { FollowUpStatusControls } from "@/components/admin/follow-ups/follow-up-status-controls";
import {
  AdminFollowUpsShell,
  type AdminFollowUpsData,
} from "@/components/admin/follow-ups/follow-ups-shell";
import {
  PeopleManagementShell,
  type PeopleManagementData,
} from "@/components/admin/people-management-shell";
import { CareFollowUpsSection } from "@/components/admin/shepherd-care/care-follow-ups-section";
import { CareActions } from "@/components/admin/shepherd-care/care-actions";
import {
  SettingsShell,
  type SettingsShellData,
} from "@/components/admin/settings-shell";
import { GroupHealthTriage } from "@/components/lg/admin/group-health-triage";
import { SuperAdminCollapsibleSection } from "@/components/admin/super-admin-collapsible-section";
import { SuperAdminSectionAnchors } from "@/components/admin/super-admin-section-anchors";
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
import { group } from "@/lib/dashboard/group-fixtures";
import type {
  MasterCalendarGroupSummary,
  MasterCalendarLeader,
  MasterOccurrence,
} from "@/lib/admin/master-calendar";
import type { ShepherdCareFollowUpsRow } from "@/types/database";

const STAMP = "2026-05-18T12:00:00Z";

function occurrence(
  groupName: string,
  groupId: string,
  date: string
): MasterOccurrence {
  return {
    groupId,
    groupName,
    lifecycleStatus: "active",
    meetingDay: "Tuesday",
    meetingTime: "19:00",
    meetingFrequency: "weekly",
    meetingWeekParity: null,
    leaders: [{ profileId: `${groupId}-l`, name: "Pat Lee" }],
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
  groupMetricSettings: DEMO_METRIC_SETTINGS,
  errors: { defaults: null, groups: null, overrides: null },
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

      <Surface id="people" heading="People (directory / add / assignments)">
        <PeopleManagementShell data={PEOPLE_DATA} />
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

      <Surface id="group-health" heading="Group health (triage)">
        <GroupHealthTriage
          rows={GROUP_HEALTH_ROWS}
          period="2026-05-01"
          spiritualGrowthLabel="Spiritual growth (1–5)"
          groupQuestionLabel="Group engagement — leader-reported (1–5)"
          watchGrade="C"
        />
      </Surface>

      <Surface
        id="settings"
        heading="Settings (defaults, thresholds, overrides)"
      >
        <SettingsShell data={SETTINGS_DATA} />
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
    </main>
  );
}
