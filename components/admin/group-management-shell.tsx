import { GroupsDirectory } from "@/components/admin/groups-directory";
import { P, fontBody } from "@/lib/pastoral";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";

// Per-group triage signals that the four status labels alone don't carry. All
// default to "no concern" when absent, so a group the overview never returned
// (or a failed side read) never spuriously lands in a triage tab.
export type GroupHealthSignals = {
  // One or more required ratings (spiritual-growth / group-question) are not yet
  // recorded for the current period — distinct from "not assessed", because a
  // group can have an attendance-derived grade letter while still missing these.
  missingRequiredRatings: boolean;
  // The group has at least one open / in-progress generic follow-up, or the
  // director's group-health "needs follow-up" flag is set.
  hasOpenFollowUp: boolean;
  // A leader / co-leader of this group has an open shepherd-care concern
  // (per-leader care model, PRD). Members are never counted.
  hasCareConcern: boolean;
};

export type GroupManagementData = {
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  profiles: ProfilesRow[];
  memberships: GroupMembershipsRow[];
  latestSessions: AttendanceSessionsRow[];
  latestWeek: string | null;
  metricDefaults: MetricDefaults;
  groupMetricSettings: GroupMetricSettingsRow[];
  // The Group-Health Grade (Q12 computed letter) per group id, for the Health
  // zone. Absent / null = not assessed. Keyed by group id; closed groups are
  // simply absent (the overview reads active groups only).
  healthGradesByGroupId: Record<string, GroupHealthLetter | null>;
  // Per-group triage signals beyond the grade letter, projected from the same
  // group-health overview the Health zone uses, plus the group's open follow-up
  // and leader-care concern reads. These drive the Needs Health Check (missing
  // required ratings) and Needs Attention (union of concerns) tabs per plan §4.
  healthSignalsByGroupId: Record<string, GroupHealthSignals>;
  errors: {
    groups: string | null;
    leaders: string | null;
    profiles: string | null;
    memberships: string | null;
    sessions: string | null;
    settings: string | null;
    // The Group-Health overview read. When it fails the grade/​signal maps are
    // empty, so every group would otherwise read as "Not assessed" with no
    // warning — surface the failure rather than silently misclassifying.
    health: string | null;
  };
};

export function GroupManagementShell({
  data,
  viewerId,
}: {
  data: GroupManagementData;
  // Signed-in profile id, threaded only to scope this browser's saved
  // card⇄table view preference per admin (#325). Null when no identity is
  // available; the directory falls back to a shared bucket.
  viewerId?: string | null;
}) {
  const anyError =
    data.errors.groups ||
    data.errors.leaders ||
    data.errors.profiles ||
    data.errors.memberships ||
    data.errors.sessions ||
    data.errors.settings ||
    data.errors.health;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <div role="alert" style={alertStyle}>
          One or more reads failed. The page below shows what we did get; retry
          in a moment or check the database connection.
        </div>
      ) : null}

      {/* Groups is the single source of truth for setup, health, capacity, and
          lifecycle (#300). The directory hosts the five list tabs (including
          Archived), the four independent status labels, and the six-zone cards;
          creating opens the shared editing drawer from its "New group" control
          (#266). */}
      <GroupsDirectory
        groups={data.groups}
        groupLeaders={data.groupLeaders}
        profiles={data.profiles}
        memberships={data.memberships}
        latestSessions={data.latestSessions}
        latestWeek={data.latestWeek}
        metricDefaults={data.metricDefaults}
        groupMetricSettings={data.groupMetricSettings}
        healthGradesByGroupId={data.healthGradesByGroupId}
        healthSignalsByGroupId={data.healthSignalsByGroupId}
        watchGrade={data.metricDefaults.group_health_watch_grade}
        viewerId={viewerId}
      />
    </div>
  );
}

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;
