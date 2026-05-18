import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  "admin.create_leader_profile": "Added leader",
  "admin.create_member": "Added member",
  "admin.assign_leader_to_group": "Assigned leader",
  "admin.assign_member_to_group": "Placed member",
  "admin.deactivate_profile": "Deactivated profile",
  "admin.deactivate_member": "Deactivated member",
  "admin.create_group": "Created group",
  "admin.update_group": "Updated group",
  "admin.close_group": "Closed group",
  "admin.reopen_group": "Reopened group",
  "leader.submit_checkin": "Submitted check-in",
  "leader.update_checkin": "Updated check-in",
  "leader.mark_did_not_meet": "Did not meet",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function summarize(
  event: AuditEventsRow,
  profilesById: Map<string, ProfilesRow>,
  membersById: Map<string, MembersRow>,
  groupsById: Map<string, GroupsRow>,
): string {
  const md = isRecord(event.metadata) ? event.metadata : {};
  const after = isRecord(md.after) ? md.after : {};
  const before = isRecord(md.before) ? md.before : {};
  const fullName = asString(after.full_name);

  switch (event.action) {
    case "admin.create_leader_profile":
      return `Added leader ${fullName ?? "(unknown)"}`;
    case "admin.create_member":
      return `Added member ${fullName ?? "(unknown)"}`;
    case "admin.assign_leader_to_group": {
      const profileId = asString(md.profile_id);
      const groupId = asString(md.group_id);
      const role = asString(md.role) ?? "leader";
      const profile = profileId ? profilesById.get(profileId) : undefined;
      const group = groupId ? groupsById.get(groupId) : undefined;
      return `Assigned ${profile?.full_name ?? "leader"} as ${role.replace(
        "_",
        "-",
      )} to ${group?.name ?? "a group"}`;
    }
    case "admin.assign_member_to_group": {
      const memberId = asString(md.member_id);
      const groupId = asString(md.group_id);
      const member = memberId ? membersById.get(memberId) : undefined;
      const group = groupId ? groupsById.get(groupId) : undefined;
      return `Placed ${member?.full_name ?? "member"} in ${group?.name ?? "a group"}`;
    }
    case "admin.deactivate_profile": {
      const entityProfile = event.entity_id
        ? profilesById.get(event.entity_id)
        : undefined;
      const count = asNumber(md.deactivated_group_leader_assignments_count) ?? 0;
      const cascade =
        count > 0 ? ` (closed ${count} active assignment${count === 1 ? "" : "s"})` : "";
      const previousStatus = isRecord(before) ? asString(before.status) : null;
      return `Deactivated profile ${entityProfile?.full_name ?? ""}${
        previousStatus ? ` (was ${previousStatus})` : ""
      }${cascade}`.trim();
    }
    case "admin.deactivate_member": {
      const entityMember = event.entity_id
        ? membersById.get(event.entity_id)
        : undefined;
      const count = asNumber(md.deactivated_group_memberships_count) ?? 0;
      const cascade =
        count > 0
          ? ` (closed ${count} active membership${count === 1 ? "" : "s"})`
          : "";
      return `Deactivated member ${entityMember?.full_name ?? ""}${cascade}`.trim();
    }
    case "admin.create_group": {
      const name =
        asString(after.name) ??
        (event.entity_id ? groupsById.get(event.entity_id)?.name : undefined) ??
        "(unknown)";
      return `Created group ${name}`;
    }
    case "admin.update_group": {
      const name =
        asString(after.name) ??
        (event.entity_id ? groupsById.get(event.entity_id)?.name : undefined) ??
        "(unknown)";
      return `Updated group ${name}`;
    }
    case "admin.close_group": {
      const name = event.entity_id ? groupsById.get(event.entity_id)?.name : undefined;
      return `Closed group ${name ?? ""}`.trim();
    }
    case "admin.reopen_group": {
      const name = event.entity_id ? groupsById.get(event.entity_id)?.name : undefined;
      return `Reopened group ${name ?? ""}`.trim();
    }
    case "leader.submit_checkin":
    case "leader.update_checkin":
    case "leader.mark_did_not_meet": {
      const groupId = asString(md.group_id);
      const group = groupId ? groupsById.get(groupId) : undefined;
      const meetingWeek = asString(md.meeting_week);
      const attendanceCount = asNumber(md.attendance_count) ?? 0;
      const groupLabel = group?.name ?? "a group";
      const weekLabel = meetingWeek ? ` (week of ${meetingWeek})` : "";
      if (event.action === "leader.mark_did_not_meet") {
        return `Recorded "did not meet" for ${groupLabel}${weekLabel}`.trim();
      }
      const verb =
        event.action === "leader.update_checkin" ? "Updated check-in" : "Submitted check-in";
      const counted =
        attendanceCount > 0
          ? ` (${attendanceCount} attendance record${attendanceCount === 1 ? "" : "s"})`
          : "";
      return `${verb} for ${groupLabel}${weekLabel}${counted}`.trim();
    }
    default:
      return ACTION_LABELS[event.action] ?? event.action;
  }
}

export function AuditTrailSection({
  events,
  profilesById,
  membersById,
  groupsById,
  error,
}: {
  events: AuditEventsRow[];
  profilesById: Map<string, ProfilesRow>;
  membersById: Map<string, MembersRow>;
  groupsById: Map<string, GroupsRow>;
  error: string | null;
}) {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Audit trail"
        title="Every change, recorded"
        description="A read-only stream of admin people-management actions. Phone numbers are intentionally omitted; admin can see contact details on the profile directly."
      />
      {error ? (
        <ErrorBanner>Couldn&rsquo;t load audit events: {error}</ErrorBanner>
      ) : events.length === 0 ? (
        <Empty
          title="No admin actions recorded yet"
          description="Once you add or assign someone above, the change will land here for the record."
        />
      ) : (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 1,
            background: P.line2,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {events.map((event) => {
            const actor = event.actor_profile_id
              ? profilesById.get(event.actor_profile_id)
              : null;
            return (
              <li
                key={event.id}
                style={{
                  background: P.surface,
                  padding: "12px 16px",
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
                      fontSize: 14,
                      color: P.ink,
                      fontWeight: 500,
                      marginBottom: 2,
                    }}
                  >
                    {summarize(event, profilesById, membersById, groupsById)}
                  </div>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 11,
                      color: P.ink3,
                      letterSpacing: 0.3,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {ACTION_LABELS[event.action] ?? event.action} · {event.entity_type}
                    </span>
                    {actor ? <span>by {actor.full_name}</span> : null}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    color: P.ink3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTimestamp(event.created_at)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
