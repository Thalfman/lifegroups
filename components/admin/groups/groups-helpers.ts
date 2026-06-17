import type { GroupTriageSignals } from "@/lib/dashboard/group-status";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type { AttendanceSessionStatus } from "@/types/enums";
import { formatMeetingTime } from "@/lib/shared/meeting-time";

// The resolved "leader · co-leader" text, or null when the group has no active
// leader. Shared by the card's Setup zone and the table's Leader column so both
// read identically and the table sorts the same text it shows. Null (rather than
// "Unassigned") lets the table sort unassigned groups last and lets the card
// pick its own placeholder.
export function leaderTextFor(
  leaders: GroupLeadersRow[],
  profilesById: Map<string, ProfilesRow>
): string | null {
  if (leaders.length === 0) return null;
  return leaders
    .map((l) => {
      const profile = profilesById.get(l.profile_id);
      if (!profile) return "(unknown)";
      return `${profile.full_name} · ${l.role === "co_leader" ? "Co" : "Lead"}`;
    })
    .join(" · ");
}

// Repeated row actions (View / Edit / Calendar / Restore) name their group, but
// group names are not unique in the data model. Append a stable, human-meaningful
// discriminator — meeting area, else meeting day — so two groups that share a
// name stay distinguishable to screen-reader users. Shared by the card and the
// table so both modes carry identical record-context action names (a11y suite).
export function groupAccessibleLabel(group: GroupsRow): string {
  const context =
    group.location_area?.trim() || group.meeting_day?.trim() || null;
  return context ? `${group.name} (${context})` : group.name;
}

export function metaLine(group: GroupsRow): string {
  const parts: string[] = [];
  if (group.location_area) parts.push(group.location_area);
  const day = group.meeting_day?.trim();
  const time = formatMeetingTime(group.meeting_time);
  if (day && time) parts.push(`${day} · ${time}`);
  else if (day) parts.push(day);
  else if (time) parts.push(time);
  const cadence = cadenceLabel(group);
  if (cadence) parts.push(cadence);
  return parts.length > 0 ? parts.join(" · ") : "No meeting day/time set";
}

function cadenceLabel(group: GroupsRow): string | null {
  if (group.meeting_frequency === "weekly") return null;
  if (group.meeting_frequency === "monthly") return "Monthly";
  // bi-weekly: include parity when known so the line tells the operator
  // which weeks the group actually meets.
  if (group.meeting_week_parity === "odd") return "Bi-weekly · odd weeks";
  if (group.meeting_week_parity === "even") return "Bi-weekly · even weeks";
  return "Bi-weekly";
}

export function formatWeek(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

export function latestCheckinText(
  session: AttendanceSessionsRow | null
): string {
  if (!session) return "No check-in on record";
  const map: Record<AttendanceSessionStatus, string> = {
    submitted: "Submitted",
    not_submitted: "Missing",
    did_not_meet: "Did not meet",
    planned_pause: "Planned pause",
    admin_entered: "Admin entered",
  };
  const label =
    map[session.status as AttendanceSessionStatus] ?? session.status;
  return `Latest check-in: ${label} · ${formatWeek(session.meeting_week)}`;
}

// Stable empty array so a leaderless group passes the same reference to the
// memoized GroupCard across renders (a fresh `[]` would defeat React.memo).
export const NO_LEADERS: GroupLeadersRow[] = [];

// Stable "no concern" signals for groups with no health-overview row or side-
// read entry (e.g. a group not yet graded). Frozen so it's a shared reference.
export const NO_SIGNALS: GroupTriageSignals = Object.freeze({
  missingRequiredRatings: false,
  hasOpenFollowUp: false,
  hasCareConcern: false,
});
