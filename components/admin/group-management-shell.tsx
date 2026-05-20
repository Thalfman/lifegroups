import { SectionHeader } from "@/components/layout/shell";
import { GroupsDirectory } from "@/components/admin/groups-directory";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { RestoreGroupButton } from "@/components/admin/forms/restore-group-button";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { MetricDefaults } from "@/lib/admin/metrics";
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
  const closedGroups = data.groups
    .filter((g) => g.lifecycle_status === "closed")
    .sort((a, b) => a.name.localeCompare(b.name));

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

      <GroupsDirectory
        groups={data.groups}
        groupLeaders={data.groupLeaders}
        profiles={data.profiles}
        memberships={data.memberships}
        latestSessions={data.latestSessions}
        latestWeek={data.latestWeek}
        metricDefaults={data.metricDefaults}
        groupMetricSettings={data.groupMetricSettings}
      />

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="New group"
          title="Start a Life Group"
          description="Just a name is enough to get started. You can fill in capacity, day, and leader later from Manage People."
        />
        <Card>
          <GroupCreateForm />
        </Card>
      </section>

      {closedGroups.length > 0 ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Archived groups"
            title="The archive"
            description="These groups are off the active roster but everything's preserved. Restore one to bring it back."
          />
          <ul style={listResetStyle}>
            {closedGroups.map((group) => (
              <li key={group.id} style={{ marginBottom: 14 }}>
                <ClosedGroupCard group={group} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClosedGroupCard({ group }: { group: GroupsRow }) {
  return (
    <article
      className="lg-m-grid-stack"
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 12,
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 16,
            color: P.ink2,
            fontWeight: 500,
            fontStyle: "italic",
          }}
        >
          {group.name}
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            color: P.ink3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          {group.closed_at
            ? `Archived ${new Date(group.closed_at).toLocaleDateString()}`
            : "Archived"}
        </div>
      </div>
      <RestoreGroupButton groupId={group.id} groupName={group.name} />
    </article>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;
