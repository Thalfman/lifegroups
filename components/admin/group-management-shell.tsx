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
  errors: {
    groups: string | null;
    leaders: string | null;
    profiles: string | null;
    memberships: string | null;
    sessions: string | null;
    settings: string | null;
  };
};

export function GroupManagementShell({ data }: { data: GroupManagementData }) {
  const anyError =
    data.errors.groups ||
    data.errors.leaders ||
    data.errors.profiles ||
    data.errors.memberships ||
    data.errors.sessions ||
    data.errors.settings;

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
        watchGrade={data.metricDefaults.group_health_watch_grade}
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
