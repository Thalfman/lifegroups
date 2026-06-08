// Pure helpers for rendering audit_events rows as human-readable summaries.
// Extracted from components/admin/audit-trail-section.tsx so the same
// function can be unit-tested without React + so adding a new RPC's
// audit action lands its label in one place.
//
// Privacy invariant: the summarize() function MUST NOT echo free-text
// fields back to the UI from audit metadata — care interaction notes,
// admin summaries, and launch-planning notes are all redacted into
// boolean presence flags (has_notes / has_summary) at the RPC layer.
// This helper renders structural facts (who, what, which entity) only.

import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
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
  "admin.set_group_category": "Tagged group into category",
  "leader.submit_checkin": "Submitted check-in",
  "leader.update_checkin": "Updated check-in",
  "leader.mark_did_not_meet": "Did not meet",
  "super_admin.update_profile_role": "Changed role",
  "super_admin.invite_user": "Invited user",
  "super_admin.set_platform_config": "Updated platform config",
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
  // Phase 5A.6 group calendar.
  "admin.group_calendar_event_created": "Created calendar event",
  "admin.group_calendar_event_updated": "Updated calendar event",
  "admin.group_calendar_event_archived": "Archived calendar event",
  "admin.group_calendar_event_restored": "Restored calendar event",
  "leader.group_calendar_event_created": "Leader created calendar event",
  "leader.group_calendar_event_updated": "Leader updated calendar event",
  "leader.group_calendar_event_archived": "Leader archived calendar event",
  "leader.group_calendar_event_restored": "Leader restored calendar event",
  // SC.1 Julian shepherd care tracker.
  "admin.upsert_shepherd_care_profile": "Updated care profile",
  "admin.log_shepherd_care_interaction": "Logged care interaction",
  // SC.2 over-shepherd coverage tracking.
  "admin.create_over_shepherd": "Added over-shepherd",
  "admin.update_over_shepherd": "Updated over-shepherd",
  "admin.assign_shepherd_coverage": "Assigned coverage",
  "admin.end_shepherd_coverage": "Ended coverage",
  // LDR.1 (#126) over-shepherd broad-note write.
  "over_shepherd.log_broad_note": "Logged a broad note",
  // LP.1 / LP.2 launch planning.
  "admin.update_launch_planning_assumptions": "Updated launch baseline",
  "admin.create_launch_planning_scenario": "Created launch scenario",
  "admin.update_launch_planning_scenario": "Updated launch scenario",
  "admin.archive_launch_planning_scenario": "Archived launch scenario",
  "admin.set_current_launch_planning_scenario": "Set current launch scenario",
};

// Coarse buckets for the Super Admin Console audit filter. "other" covers
// everything outside the four filterable buckets (it still shows under "All").
export type AuditCategory = "role" | "invite" | "danger" | "settings" | "other";

// The Super-Admin danger-zone audit actions (clear/reset/delete/restore). Kept
// as an explicit prefix list so unrelated "reset" actions — request_password_reset
// (account) and admin.reset_metric_defaults (settings) — don't get miscategorised.
const DANGER_ACTION_RE =
  /^super_admin\.(clean_slate|launch_prep|permanent_delete|reset_all|reset_attention|reset_audit|reset_care|reset_health|reset_history|restore_tombstone)/;

const SETTINGS_ACTION_RE =
  /(platform_config|feature_flag|set_copy|metric_defaults|group_metric_settings|set_group_category)/;

// Bucket an audit action string for the console's category filter. Pure string
// classification — no I/O — so it's trivially unit-testable and usable both
// server-side (building the entries) and as the basis for the client filter.
export function categorizeAuditAction(action: string): AuditCategory {
  if (action.includes("role")) return "role";
  if (action.includes("invite")) return "invite";
  if (DANGER_ACTION_RE.test(action)) return "danger";
  if (SETTINGS_ACTION_RE.test(action)) return "settings";
  return "other";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

// Mirrors the canonical `shepherd_care_interaction_type` enum
// (call | text | in_person | meeting | other). The string returned
// here is the lowercase noun used inline in the audit summary —
// the user-facing capitalized label lives in `lib/dashboard/labels.ts`.
function interactionTypeLabel(value: string | null): string {
  switch (value) {
    case "call":
      return "call";
    case "text":
      return "text";
    case "in_person":
      return "in-person visit";
    case "meeting":
      return "meeting";
    case "other":
      return "touchpoint";
    default:
      return "touchpoint";
  }
}

export type AuditSummaryMaps = {
  profilesById: Map<string, Pick<ProfilesRow, "id" | "full_name">>;
  membersById: Map<string, Pick<MembersRow, "id" | "full_name">>;
  groupsById: Map<string, Pick<GroupsRow, "id" | "name">>;
};

export function summarizeAuditEvent(
  event: AuditEventsRow,
  maps: AuditSummaryMaps
): string {
  const { profilesById, membersById, groupsById } = maps;
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
        /_/g,
        "-"
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
      const count =
        asNumber(md.deactivated_group_leader_assignments_count) ?? 0;
      const cascade =
        count > 0
          ? ` (closed ${count} active assignment${count === 1 ? "" : "s"})`
          : "";
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
      const name = event.entity_id
        ? groupsById.get(event.entity_id)?.name
        : undefined;
      return `Closed group ${name ?? ""}`.trim();
    }
    case "admin.reopen_group": {
      const name = event.entity_id
        ? groupsById.get(event.entity_id)?.name
        : undefined;
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
      return type
        ? `Created ${type} follow-up: ${title}`
        : `Created follow-up: ${title}`;
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
            (k): k is string => typeof k === "string"
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
      const target = event.entity_id
        ? profilesById.get(event.entity_id)
        : undefined;
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
    case "super_admin.invite_user": {
      // Invite metadata carries email + role at top-level, plus the
      // post-invite role in `after`. Render structural identifiers only —
      // never trust unbounded free-text from the payload.
      const email = asString(md.email);
      const role = asString(after.role) ?? asString(md.role);
      // Canonical `groupAssignmentState` enum from
      // `admin_invite_user` and `InviteUserSuccess`:
      //   "none" | "created" | "reactivated" | "already_active"
      // Every non-"none" state implies a group is attached.
      const groupAssignmentState = asString(md.groupAssignmentState);
      const groupId = asString(md.groupId);
      const group = groupId ? groupsById.get(groupId) : undefined;
      const target = email ?? "user";
      const rolePart = role ? ` as ${role.replace(/_/g, "-")}` : "";
      const hasGroup =
        groupAssignmentState !== null &&
        groupAssignmentState !== "none" &&
        group !== undefined;
      const groupPart = hasGroup ? `, assigned to ${group!.name}` : "";
      return `Invited ${target}${rolePart}${groupPart}`;
    }
    case "admin.create_over_shepherd": {
      const name = asString(after.full_name) ?? "(unknown)";
      return `Added over-shepherd ${name}`;
    }
    case "admin.update_over_shepherd": {
      const beforeName = isRecord(before) ? asString(before.full_name) : null;
      const afterName = asString(after.full_name) ?? "(unknown)";
      const beforeActive = isRecord(before)
        ? typeof before.active === "boolean"
          ? (before.active as boolean)
          : null
        : null;
      const afterActive =
        typeof after.active === "boolean" ? (after.active as boolean) : null;
      if (beforeActive === true && afterActive === false) {
        return `Archived over-shepherd ${afterName}`;
      }
      if (beforeActive === false && afterActive === true) {
        return `Reactivated over-shepherd ${afterName}`;
      }
      if (beforeName && beforeName !== afterName) {
        return `Renamed over-shepherd ${beforeName} → ${afterName}`;
      }
      return `Updated over-shepherd ${afterName}`;
    }
    case "admin.assign_shepherd_coverage": {
      const shepherdId = asString(md.shepherd_profile_id);
      const shepherd = shepherdId ? profilesById.get(shepherdId) : undefined;
      const replaced = asString(md.replaced_assignment_id);
      const verb = replaced
        ? "Reassigned coverage for"
        : "Assigned coverage for";
      return `${verb} ${shepherd?.full_name ?? "a shepherd"}`;
    }
    case "admin.end_shepherd_coverage": {
      const shepherdId = asString(md.shepherd_profile_id);
      const shepherd = shepherdId ? profilesById.get(shepherdId) : undefined;
      return `Ended coverage for ${shepherd?.full_name ?? "a shepherd"}`;
    }
    case "admin.upsert_shepherd_care_profile": {
      // Care profile audit metadata uses `has_summary` (boolean) — the
      // free-text admin_summary is never written into the audit row.
      // Render the shepherd's name (looked up locally) and the change type.
      // Note: event.entity_id is the care_profile_id, NOT the shepherd
      // profile id, so it can't fall back into profilesById.
      const shepherdId = asString(md.shepherd_profile_id) ?? null;
      const shepherd = shepherdId ? profilesById.get(shepherdId) : undefined;
      const name = shepherd?.full_name ?? "a shepherd";
      const wasJustCreated = md.was_just_created === true;
      const beforeStatus = isRecord(before)
        ? asString(before.current_status)
        : null;
      const afterStatus = asString(after.current_status);
      if (wasJustCreated) {
        return `Created care profile for ${name}`;
      }
      if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
        return `Updated ${name}'s care profile (${beforeStatus} → ${afterStatus})`;
      }
      return `Updated ${name}'s care profile`;
    }
    case "admin.log_shepherd_care_interaction": {
      // Interaction audit metadata uses `has_notes` (boolean) — the
      // notes body is never written into the audit row. Render the
      // shepherd's name + interaction type + date.
      //
      // The RPC nests shepherd_profile_id under metadata.after (see
      // admin_log_shepherd_care_interaction in
      // 20260518160000_phase5d0_shepherd_care_foundation.sql). The
      // top-level fallback is kept defensive in case a future RPC
      // change moves it.
      const shepherdId =
        asString(after.shepherd_profile_id) ??
        asString(md.shepherd_profile_id) ??
        null;
      const shepherd = shepherdId ? profilesById.get(shepherdId) : undefined;
      const name = shepherd?.full_name ?? "a shepherd";
      const type = interactionTypeLabel(asString(after.interaction_type));
      const date = asString(after.interaction_at);
      const datePart = date ? ` on ${date}` : "";
      return `Logged ${type} with ${name}${datePart}`;
    }
    case "admin.update_launch_planning_assumptions": {
      const submittedKeys = Array.isArray(md.submitted_keys)
        ? (md.submitted_keys as unknown[]).filter(
            (k): k is string => typeof k === "string"
          )
        : [];
      return submittedKeys.length > 0
        ? `Updated launch baseline (${submittedKeys.join(", ")})`
        : "Updated launch baseline";
    }
    case "admin.create_launch_planning_scenario": {
      const name = asString(after.name) ?? "(unnamed)";
      const isCurrent = after.is_current === true;
      return isCurrent
        ? `Created launch scenario ${name} (current)`
        : `Created launch scenario ${name}`;
    }
    case "admin.update_launch_planning_scenario": {
      const beforeName = isRecord(before) ? asString(before.name) : null;
      const afterName = asString(after.name) ?? "(unnamed)";
      const beforeCurrent = isRecord(before)
        ? before.is_current === true
        : false;
      const afterCurrent = after.is_current === true;
      if (!beforeCurrent && afterCurrent) {
        return `Made launch scenario ${afterName} current`;
      }
      if (beforeName && beforeName !== afterName) {
        return `Renamed launch scenario ${beforeName} → ${afterName}`;
      }
      return `Updated launch scenario ${afterName}`;
    }
    case "admin.archive_launch_planning_scenario": {
      const name =
        (isRecord(before) ? asString(before.name) : null) ??
        asString(after.name) ??
        "(unnamed)";
      return `Archived launch scenario ${name}`;
    }
    case "admin.set_current_launch_planning_scenario": {
      const name = asString(after.name) ?? "(unnamed)";
      return `Set current launch scenario to ${name}`;
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
        event.action === "leader.update_checkin"
          ? "Updated check-in"
          : "Submitted check-in";
      const counted =
        attendanceCount > 0
          ? ` (${attendanceCount} attendance record${attendanceCount === 1 ? "" : "s"})`
          : "";
      return `${verb} for ${groupLabel}${weekLabel}${counted}`.trim();
    }
    default:
      return AUDIT_ACTION_LABELS[event.action] ?? event.action;
  }
}
