import { describe, expect, it } from "vitest";
import {
  buildCareAccordion,
  type CareAccordionGroupLeader,
} from "@/lib/admin/care-accordion";
import type { GroupsRow } from "@/types/database";
import type { ShepherdCareStatus } from "@/types/enums";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  OverShepherdListRow,
  ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";

// #373 — the Care accordion model. Pure grouping of Leaders under their
// Over-Shepherd (coverage assignments are the backbone), with group-name
// resolution from active group_leaders + groups, an always-present Unassigned
// pane, and Leader Care Status passed straight through.

const TODAY = "2026-06-05";

function overShepherd(
  id: string,
  fullName: string,
  active = true
): OverShepherdListRow {
  return {
    id,
    full_name: fullName,
    email: `${id}@example.com`,
    phone: null,
    active,
    archived_at: active ? null : `${TODAY}T00:00:00Z`,
    created_at: `${TODAY}T00:00:00Z`,
    updated_at: `${TODAY}T00:00:00Z`,
  };
}

function assignment(
  leaderId: string,
  overShepherdId: string,
  overShepherdName: string
): ActiveShepherdCoverageAssignmentSummary {
  return {
    id: `asg-${leaderId}`,
    shepherd_profile_id: leaderId,
    over_shepherd_id: overShepherdId,
    assigned_at: `${TODAY}T00:00:00Z`,
    over_shepherd: {
      id: overShepherdId,
      full_name: overShepherdName,
      active: true,
    },
  };
}

function entry(
  id: string,
  fullName: string,
  status: ShepherdCareStatus | null
): ShepherdCareDirectoryEntry {
  return {
    profile: {
      id,
      full_name: fullName,
      email: `${id}@example.com`,
      role: "leader",
      status: "active",
    },
    care:
      status === null
        ? null
        : {
            id: `cp-${id}`,
            shepherd_profile_id: id,
            current_status: status,
            last_contact_at: null,
            next_touchpoint_due: null,
            archived_at: null,
            created_at: `${TODAY}T00:00:00Z`,
            updated_at: `${TODAY}T00:00:00Z`,
          },
    needs_attention: false,
  };
}

function group(
  id: string,
  name: string,
  lifecycle: GroupsRow["lifecycle_status"] = "active"
): GroupsRow {
  return { id, name, lifecycle_status: lifecycle } as GroupsRow;
}

function groupLeader(
  profileId: string,
  groupId: string
): CareAccordionGroupLeader {
  return { profile_id: profileId, group_id: groupId };
}

describe("buildCareAccordion", () => {
  it("groups Leaders under their covering Over-Shepherd", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const named = panes.find((p) => p.overShepherdId === "os-1");
    expect(named).toBeDefined();
    expect(named!.leaders.map((l) => l.profileId)).toEqual(["ldr-1"]);
  });

  it("resolves active group names for each Leader", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-2"), groupLeader("ldr-1", "g-1")],
      groups: [group("g-1", "Alpha Group"), group("g-2", "Beta Group")],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    // De-duped, name-sorted.
    expect(leader.groupNames).toEqual(["Alpha Group", "Beta Group"]);
  });

  it("excludes closed (non-active) groups from a Leader's group names", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-closed")],
      groups: [group("g-closed", "Closed Group", "closed")],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    expect(leader.groupNames).toEqual([]);
  });

  it("puts Leaders with no active coverage in the Unassigned pane", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-x", "Una Assigned", "needs_follow_up")],
    });

    const unassigned = panes.find((p) => p.isUnassigned);
    expect(unassigned).toBeDefined();
    expect(unassigned!.overShepherdId).toBeNull();
    expect(unassigned!.leaders.map((l) => l.profileId)).toEqual(["ldr-x"]);
  });

  it("always emits an Unassigned pane, last, even with no unassigned Leaders", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const last = panes[panes.length - 1]!;
    expect(last.isUnassigned).toBe(true);
    expect(last.leaders).toEqual([]);
  });

  it("passes Leader Care Status straight through (null when no care profile)", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [
        assignment("ldr-1", "os-1", "Olive Shepherd"),
        assignment("ldr-2", "os-1", "Olive Shepherd"),
      ],
      groupLeaders: [],
      groups: [],
      careEntries: [
        entry("ldr-1", "Concerned Carol", "concern"),
        entry("ldr-2", "New Ned", null),
      ],
    });

    const leaders = panes.find((p) => p.overShepherdId === "os-1")!.leaders;
    const byId = new Map(leaders.map((l) => [l.profileId, l.careStatus]));
    expect(byId.get("ldr-1")).toBe("concern");
    expect(byId.get("ldr-2")).toBeNull();
  });

  it("seeds an empty pane for an active Over-Shepherd with no covered Leaders", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-empty", "Empty Ed")],
      assignments: [],
      groupLeaders: [],
      groups: [],
      careEntries: [],
    });

    const pane = panes.find((p) => p.overShepherdId === "os-empty");
    expect(pane).toBeDefined();
    expect(pane!.leaders).toEqual([]);
  });

  it("excludes archived Over-Shepherds and treats their Leaders as unassigned", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-old", "Archie Archived", false)],
      assignments: [assignment("ldr-1", "os-old", "Archie Archived")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    expect(panes.find((p) => p.overShepherdId === "os-old")).toBeUndefined();
    const unassigned = panes.find((p) => p.isUnassigned)!;
    expect(unassigned.leaders.map((l) => l.profileId)).toEqual(["ldr-1"]);
  });

  it("sorts named panes by name with Unassigned last, and Leaders by name", () => {
    const panes = buildCareAccordion({
      overShepherds: [
        overShepherd("os-z", "Zara Shepherd"),
        overShepherd("os-a", "Aaron Shepherd"),
      ],
      assignments: [
        assignment("ldr-2", "os-a", "Aaron Shepherd"),
        assignment("ldr-1", "os-a", "Aaron Shepherd"),
      ],
      groupLeaders: [],
      groups: [],
      careEntries: [
        entry("ldr-1", "Zeb Leader", "doing_well"),
        entry("ldr-2", "Abe Leader", "doing_well"),
      ],
    });

    expect(panes.map((p) => p.overShepherdName)).toEqual([
      "Aaron Shepherd",
      "Zara Shepherd",
      "Unassigned",
    ]);
    const aaron = panes.find((p) => p.overShepherdId === "os-a")!;
    expect(aaron.leaders.map((l) => l.fullName)).toEqual([
      "Abe Leader",
      "Zeb Leader",
    ]);
  });
});
