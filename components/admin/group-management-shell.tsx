import { SectionHeader } from "@/components/layout/shell";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { EditGroupToggle } from "@/components/admin/forms/group-edit-form";
import { CloseGroupButton } from "@/components/admin/forms/close-group-button";
import { ReopenGroupButton } from "@/components/admin/forms/reopen-group-button";
import { Phase5A2Notice } from "@/components/admin/phase-5a2-notice";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export type GroupManagementData = {
  groups: GroupsRow[];
  profiles: ProfilesRow[];
  members: MembersRow[];
  auditEvents: AuditEventsRow[];
  showAuditTrail: boolean;
  errors: {
    groups: string | null;
    profiles: string | null;
    members: string | null;
    auditEvents: string | null;
  };
};

function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

function groupMetaLine(group: GroupsRow): string {
  const parts: string[] = [];
  if (group.location_area) parts.push(group.location_area);
  const day = group.meeting_day?.trim();
  const time = formatMeetingTime(group.meeting_time);
  if (day && time) parts.push(`${day} · ${time}`);
  else if (day) parts.push(day);
  else if (time) parts.push(time);
  if (group.capacity !== null && group.capacity !== undefined) {
    parts.push(`capacity ${group.capacity}`);
  }
  return parts.join(" · ");
}

export function GroupManagementShell({ data }: { data: GroupManagementData }) {
  const profilesById = new Map(data.profiles.map((p) => [p.id, p]));
  const membersById = new Map(data.members.map((m) => [m.id, m]));
  const groupsById = new Map(data.groups.map((g) => [g.id, g]));

  const activeGroups = data.groups.filter((g) => g.lifecycle_status !== "closed");
  const closedGroups = data.groups.filter((g) => g.lifecycle_status === "closed");

  const anyError =
    data.errors.groups ||
    data.errors.profiles ||
    data.errors.members ||
    (data.showAuditTrail ? data.errors.auditEvents : null);

  return (
    <div style={{ display: "grid", gap: 36 }}>
      <Phase5A2Notice />

      {anyError ? (
        <div
          role="alert"
          style={{
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 8,
            padding: "12px 14px",
            fontFamily: fontBody,
            fontSize: 13,
            color: "#7d3621",
          }}
        >
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the Supabase connection.
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="New group"
          title="Start a Life Group"
          description="Create a group here, then head to Manage People to assign a leader and members."
        />
        <Card>
          <GroupCreateForm />
        </Card>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Active groups"
          title="The roster"
          description="Edit any group inline, or close one to take it off the active roster. Closed groups stay in the record and can be reopened."
        />
        {data.errors.groups ? (
          <ErrorBanner>
            Couldn&rsquo;t load groups: {data.errors.groups}
          </ErrorBanner>
        ) : activeGroups.length === 0 ? (
          <Empty
            title="No active groups yet"
            description="Use the form above to add your first Life Group. Once it&rsquo;s here, you can assign a leader from the people screen."
          />
        ) : (
          <ul style={listResetStyle}>
            {activeGroups.map((group) => (
              <li key={group.id} style={{ marginBottom: 14 }}>
                <GroupCard group={group} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedGroups.length > 0 ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Closed groups"
            title="The archive"
            description="These groups are off the active roster. Reopen one to bring it back."
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

      {data.showAuditTrail ? (
        <AuditTrailSection
          events={data.auditEvents}
          profilesById={profilesById}
          membersById={membersById}
          groupsById={groupsById}
          error={data.errors.auditEvents}
        />
      ) : null}
    </div>
  );
}

function GroupCard({ group }: { group: GroupsRow }) {
  const meta = groupMetaLine(group);
  return (
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
      }}
    >
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: 20,
                fontWeight: 500,
                color: P.ink,
                letterSpacing: -0.3,
              }}
            >
              {group.name}
            </h3>
            <PBadge tone="neutral">
              {group.lifecycle_status.replace(/_/g, " ")}
            </PBadge>
          </div>
          {meta ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink3,
                marginTop: 4,
              }}
            >
              {meta}
            </div>
          ) : null}
          {group.description ? (
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 14,
                color: P.ink2,
                margin: "10px 0 0",
                lineHeight: 1.55,
              }}
            >
              {group.description}
            </p>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <EditGroupToggle group={group} />
          <CloseGroupButton groupId={group.id} groupName={group.name} />
        </div>
      </header>
    </article>
  );
}

function ClosedGroupCard({ group }: { group: GroupsRow }) {
  return (
    <article
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
            ? `Closed ${new Date(group.closed_at).toLocaleDateString()}`
            : "Closed"}
        </div>
      </div>
      <ReopenGroupButton groupId={group.id} groupName={group.name} />
    </article>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

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

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 10,
        padding: "22px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          color: P.ink,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
      }}
    >
      {children}
    </div>
  );
}
