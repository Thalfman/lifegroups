import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  summarizeAuditEvent,
  type AuditSummaryMaps,
} from "@/lib/admin/audit-summary";
import type { AuditEventsRow } from "@/types/database";

const UUID_SHEPHERD = "11111111-1111-1111-1111-111111111111";
const UUID_OTHER = "22222222-2222-2222-2222-222222222222";
const UUID_GROUP = "33333333-3333-3333-3333-333333333333";

function emptyMaps(): AuditSummaryMaps {
  return {
    profilesById: new Map(),
    membersById: new Map(),
    groupsById: new Map(),
  };
}

function mapsWithShepherd(): AuditSummaryMaps {
  const maps = emptyMaps();
  maps.profilesById.set(UUID_SHEPHERD, { id: UUID_SHEPHERD, full_name: "Avery Bennett" });
  return maps;
}

function event(
  action: string,
  metadata: Record<string, unknown>,
  overrides: Partial<AuditEventsRow> = {},
): AuditEventsRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    actor_profile_id: null,
    action,
    entity_type: action.split(".")[1] ?? action,
    entity_id: null,
    metadata,
    created_at: "2026-05-22T12:00:00Z",
    ...overrides,
  };
}

describe("AUDIT_ACTION_LABELS", () => {
  it.each([
    "admin.upsert_shepherd_care_profile",
    "admin.log_shepherd_care_interaction",
    "admin.create_over_shepherd",
    "admin.update_over_shepherd",
    "admin.assign_shepherd_coverage",
    "admin.end_shepherd_coverage",
    "admin.update_launch_planning_assumptions",
    "admin.create_launch_planning_scenario",
    "admin.update_launch_planning_scenario",
    "admin.archive_launch_planning_scenario",
    "admin.set_current_launch_planning_scenario",
    "super_admin.invite_user",
    "super_admin.update_profile_role",
    "admin.group_calendar_event_created",
    "admin.group_calendar_event_updated",
    "admin.group_calendar_event_archived",
    "admin.group_calendar_event_restored",
    "leader.group_calendar_event_created",
    "leader.group_calendar_event_updated",
    "leader.group_calendar_event_archived",
    "leader.group_calendar_event_restored",
  ])("has a friendly label for %s", (action) => {
    expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    expect(AUDIT_ACTION_LABELS[action]).not.toBe(action);
  });
});

describe("summarizeAuditEvent — shepherd care", () => {
  it("logs an interaction with the shepherd's name and friendly type", () => {
    const summary = summarizeAuditEvent(
      event("admin.log_shepherd_care_interaction", {
        after: {
          interaction_type: "call",
          interaction_at: "2026-05-20",
          has_notes: true,
        },
        shepherd_profile_id: UUID_SHEPHERD,
      }),
      mapsWithShepherd(),
    );
    expect(summary).toContain("Avery Bennett");
    expect(summary).toContain("call");
    expect(summary).toContain("2026-05-20");
  });

  it("falls back to 'a shepherd' when the profile isn't in the map", () => {
    const summary = summarizeAuditEvent(
      event("admin.log_shepherd_care_interaction", {
        after: { interaction_type: "text", interaction_at: "2026-05-20" },
        shepherd_profile_id: UUID_OTHER,
      }),
      mapsWithShepherd(),
    );
    expect(summary).toContain("a shepherd");
  });

  it("does NOT echo note bodies even if they accidentally appear in metadata", () => {
    // Defensive: the RPC only writes has_notes, but if a future change ever
    // started persisting raw text we want the summary helper to ignore it.
    const summary = summarizeAuditEvent(
      event("admin.log_shepherd_care_interaction", {
        // Hypothetical leak — the summary helper must not surface this.
        notes: "PRIVATE NOTE that should never reach the audit list",
        after: {
          interaction_type: "in_person",
          interaction_at: "2026-05-20",
          notes: "ANOTHER PRIVATE NOTE",
        },
        shepherd_profile_id: UUID_SHEPHERD,
      }),
      mapsWithShepherd(),
    );
    expect(summary).not.toContain("PRIVATE NOTE");
    expect(summary).not.toContain("ANOTHER PRIVATE");
  });

  it("renders 'Created care profile' on first upsert and 'Updated …' otherwise", () => {
    const created = summarizeAuditEvent(
      event("admin.upsert_shepherd_care_profile", {
        after: { current_status: "healthy", has_summary: false },
        before: {},
        shepherd_profile_id: UUID_SHEPHERD,
        was_just_created: true,
      }),
      mapsWithShepherd(),
    );
    expect(created).toBe("Created care profile for Avery Bennett");

    const updated = summarizeAuditEvent(
      event("admin.upsert_shepherd_care_profile", {
        after: { current_status: "needs_attention", has_summary: true },
        before: { current_status: "healthy", has_summary: false },
        shepherd_profile_id: UUID_SHEPHERD,
        was_just_created: false,
      }),
      mapsWithShepherd(),
    );
    expect(updated).toContain("Avery Bennett");
    expect(updated).toContain("healthy");
    expect(updated).toContain("needs_attention");
  });

  it("never echoes the admin_summary text from the upsert metadata", () => {
    const summary = summarizeAuditEvent(
      event("admin.upsert_shepherd_care_profile", {
        // Hypothetical leak — the summary helper must not surface this.
        admin_summary: "CONFIDENTIAL summary that must not appear in audit",
        after: {
          current_status: "healthy",
          has_summary: true,
          admin_summary: "ALSO PRIVATE",
        },
        before: { current_status: "healthy", has_summary: false },
        shepherd_profile_id: UUID_SHEPHERD,
        was_just_created: false,
      }),
      mapsWithShepherd(),
    );
    expect(summary).not.toContain("CONFIDENTIAL");
    expect(summary).not.toContain("ALSO PRIVATE");
  });
});

describe("summarizeAuditEvent — super admin invite", () => {
  it("renders the invitee email + role", () => {
    const summary = summarizeAuditEvent(
      event("super_admin.invite_user", {
        email: "julian@example.org",
        role: "ministry_admin",
        groupAssignmentState: "none",
        after: { role: "ministry_admin", status: "active" },
      }),
      emptyMaps(),
    );
    expect(summary).toContain("julian@example.org");
    expect(summary).toContain("ministry-admin");
  });

  it("includes the group name when an assignment was attached", () => {
    const maps = emptyMaps();
    maps.groupsById.set(UUID_GROUP, { id: UUID_GROUP, name: "Tuesday Night" });
    const summary = summarizeAuditEvent(
      event("super_admin.invite_user", {
        email: "leader@example.org",
        role: "leader",
        groupAssignmentState: "assigned",
        groupId: UUID_GROUP,
        after: { role: "leader", status: "active" },
      }),
      maps,
    );
    expect(summary).toContain("leader@example.org");
    expect(summary).toContain("Tuesday Night");
  });
});

describe("summarizeAuditEvent — launch planning", () => {
  it("renders submitted_keys for baseline updates and does not echo notes", () => {
    const summary = summarizeAuditEvent(
      event("admin.update_launch_planning_assumptions", {
        submitted_keys: ["expected_growth", "notes"],
        // Hypothetical leak — must not appear.
        before: { has_notes: false },
        after: { has_notes: true, notes: "RAW PRIVATE NOTE" },
      }),
      emptyMaps(),
    );
    expect(summary).toContain("expected_growth");
    expect(summary).toContain("notes");
    expect(summary).not.toContain("RAW PRIVATE");
  });

  it("flags a freshly-marked-current scenario", () => {
    const summary = summarizeAuditEvent(
      event("admin.update_launch_planning_scenario", {
        before: { name: "Expected", is_current: false },
        after: { name: "Expected", is_current: true },
      }),
      emptyMaps(),
    );
    expect(summary).toContain("Expected");
    expect(summary.toLowerCase()).toContain("current");
  });

  it("falls back to the friendly label for unknown actions", () => {
    const summary = summarizeAuditEvent(
      event("admin.archive_launch_planning_scenario", {
        before: { name: "Stretch" },
        after: {},
      }),
      emptyMaps(),
    );
    expect(summary).toContain("Stretch");
    expect(summary.toLowerCase()).toContain("archived");
  });
});
