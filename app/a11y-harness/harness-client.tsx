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
import { FollowUpStatusControls } from "@/components/admin/follow-ups/follow-up-status-controls";
import { CareFollowUpList } from "@/components/admin/shepherd-care/care-follow-up-list";
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
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
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
  occurrence("Anderson", "grp-anderson", "2026-05-19"),
  occurrence("Bryant", "grp-bryant", "2026-05-19"),
  occurrence("Carter", "grp-carter", "2026-05-26"),
];

const CARE_FOLLOW_UPS: ShepherdCareFollowUpsRow[] = [
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
    title: "Schedule Bryant visit",
    due_date: "2026-05-29",
    status: "in_progress",
    notes: null,
    created_by_profile_id: "admin-1",
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
  },
];

const FOLLOW_UPS = [
  { id: "fu-1", status: "open" as const, title: "Check in with Anderson" },
  {
    id: "fu-2",
    status: "in_progress" as const,
    title: "Confirm Bryant launch",
  },
];

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

      <Surface id="care-follow-ups" heading="Shepherd care follow-ups">
        <CareFollowUpList
          followUps={CARE_FOLLOW_UPS}
          shepherdProfileId="care-1"
          todayIso="2026-05-18"
        />
      </Surface>
    </main>
  );
}
