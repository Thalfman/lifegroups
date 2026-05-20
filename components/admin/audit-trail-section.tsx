import { SectionHeader } from "@/components/layout/shell";
import { Card } from "@/components/pastoral/primitives";
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
  "super_admin.update_profile_role": "Changed role",
  // Phase 5C.0 guest pipeline + follow-up actions.
  "admin.create_guest": "Added guest",
  "admin.update_guest_pipeline": "Updated guest pipeline",
  "admin.mark_guest_not_now": "Marked guest not now",
  "admin.create_follow_up": "Created follow-up",
  "admin.update_follow_up_status": "Updated follow-up status",
  "leader.update_follow_up_status": "Leader updated follow-up",
  // Phase 5A.4 settings + Phase 5A.5 reset
  "admin.update_metric_defaults": "Updated metric defaults",
  "admin.upsert_group_metric_settings": "Updated group overrides",
  "admin.change_leader_role": "Changed leader role",
  "admin.reset_metric_defaults": "Reset metric defaults",
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
    case "admin.create_guest": {
      const name = asString(after.full_name) ?? "(unknown)";
      const stage = asString(after.pipeline_stage);
      return stage ? `Added guest ${name} (${stage})` : `Added guest ${name}`;
    }
    case "admin.update_guest_pipeline": {
      const name = asString(md.full_name) ?? "guest";
      const beforeStage = asString(before.pipeline_stage);
      const afterStage = asString(after.pipeline_stage);
      if (beforeStage && afterStage && beforeStage !== afterStage) {
        return `Moved ${name} from ${beforeStage} to ${afterStage}`;
      }
      return `Updated ${name}'s pipeline`;
    }
    case "admin.mark_guest_not_now": {
      const name = asString(md.full_name) ?? "guest";
      return `Marked ${name} as "not now"`;
    }
    case "admin.create_follow_up": {
      const title = asString(after.title) ?? "(no title)";
      const type = asString(after.type);
      return type ? `Created ${type} follow-up: ${title}` : `Created follow-up: ${title}`;
    }
    case "admin.update_follow_up_status": {
      const title = asString(md.title) ?? "follow-up";
      const beforeStatus = asString(before.status);
      const afterStatus = asString(after.status);
      if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
        return `${title}: ${beforeStatus} → ${afterStatus}`;
      }
      return `Updated follow-up: ${title}`;
    }
    case "leader.update_follow_up_status": {
      const title = asString(md.title) ?? "follow-up";
      const beforeStatus = asString(before.status);
      const afterStatus = asString(after.status);
      if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
        return `Leader moved "${title}" ${beforeStatus} → ${afterStatus}`;
      }
      return `Leader updated follow-up: ${title}`;
    }
    case "admin.reset_metric_defaults":
      return "Reset metric defaults to baseline";
    case "admin.update_metric_defaults": {
      const submittedKeys = Array.isArray(md.submitted_keys)
        ? (md.submitted_keys as unknown[]).filter(
            (k): k is string => typeof k === "string",
          )
        : [];
      return submittedKeys.length > 0
        ? `Updated metric defaults (${submittedKeys.join(", ")})`
        : "Updated metric defaults";
    }
    case "admin.upsert_group_metric_settings": {
      const groupName = event.entity_id
        ? groupsById.get(event.entity_id)?.name
        : null;
      return groupName
        ? `Updated overrides for ${groupName}`
        : "Updated group overrides";
    }
    case "super_admin.update_profile_role": {
      const target = event.entity_id ? profilesById.get(event.entity_id) : undefined;
      const beforeRole = isRecord(before) ? asString(before.role) : null;
      const afterRole = asString(after.role);
      const name = target?.full_name ?? "(unknown profile)";
      if (beforeRole && afterRole) {
        return `Changed role of ${name} from ${beforeRole} to ${afterRole}`;
      }
      if (afterRole) {
        return `Changed role of ${name} to ${afterRole}`;
      }
      return `Changed role of ${name}`;
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
        <Card padded={false} style={{ overflow: "hidden" }}>
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 0,
            }}
          >
            {events.map((event, idx) => {
              const actor = event.actor_profile_id
                ? profilesById.get(event.actor_profile_id)
                : null;
              return (
                <li
                  key={event.id}
                  className="lg-m-grid-stack"
                  style={{
                    padding: "12px 18px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    borderTop: idx === 0 ? "none" : "1px solid var(--c-lineSoft)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 14,
                        color: "var(--c-ink)",
                        fontWeight: 500,
                        marginBottom: 3,
                        lineHeight: 1.35,
                      }}
                    >
                      {summarize(event, profilesById, membersById, groupsById)}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        color: "var(--c-ink3)",
                        letterSpacing: 0.2,
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
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--c-ink3)",
                      whiteSpace: "nowrap",
                      letterSpacing: 0.2,
                    }}
                  >
                    {formatTimestamp(event.created_at)}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </section>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <Card
      padded={false}
      style={{
        padding: "26px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          color: "var(--c-ink)",
          fontWeight: 500,
          marginBottom: 6,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-ink2)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </Card>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--c-claySoft)",
        border: "1px solid var(--c-clay)",
        borderRadius: 10,
        padding: "12px 14px",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--c-clay)",
      }}
    >
      {children}
    </div>
  );
}
