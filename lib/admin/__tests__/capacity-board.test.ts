import { describe, expect, it } from "vitest";

import {
  buildCapacityBoard,
  buildCapacityBoardModel,
  buildMultiplicationSuggestions,
  filterBoard,
  sortBoardByFullness,
  type CapacityBoardRow,
} from "@/lib/admin/capacity-board";
import { BUILT_IN_METRIC_DEFAULTS } from "@/lib/admin/metrics";
import type { GroupsRow, GroupMetricSettingsRow } from "@/types/database";
import type { LeaderReadinessStage } from "@/types/enums";

function group(over: Partial<GroupsRow> & { id: string }): GroupsRow {
  return {
    id: over.id,
    name: over.name ?? `Group ${over.id}`,
    description: null,
    meeting_day: null,
    meeting_time: null,
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: over.capacity ?? null,
    lifecycle_status: over.lifecycle_status ?? "active",
    health_status: "healthy",
    group_type: over.group_type ?? "Mixed",
    launched_on: over.launched_on ?? null,
    pause_reason: null,
    pause_start_date: null,
    expected_return_date: null,
    restart_reminder_date: null,
    admin_notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    closed_at: null,
  } as GroupsRow;
}

function override(
  group_id: string,
  over: Partial<GroupMetricSettingsRow>
): GroupMetricSettingsRow {
  return {
    group_id,
    capacity_override: over.capacity_override ?? null,
    capacity_warning_threshold_pct_override:
      over.capacity_warning_threshold_pct_override ?? null,
    healthy_attendance_pct_override:
      over.healthy_attendance_pct_override ?? null,
    manual_health_status_override: over.manual_health_status_override ?? null,
    exclude_from_capacity_metrics: over.exclude_from_capacity_metrics ?? false,
    admin_metric_notes: over.admin_metric_notes ?? null,
    check_in_due_offset_hours_override:
      over.check_in_due_offset_hours_override ?? null,
    allow_over_capacity: over.allow_over_capacity ?? false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as GroupMetricSettingsRow;
}

// CapacityBoardApprentice shape (for buildCapacityBoard's apprenticesByGroup).
function boardAp(group_id: string, stage: LeaderReadinessStage) {
  return { id: `${group_id}-ap`, displayName: `Apprentice ${group_id}`, stage };
}

// Read-model shape (for the orchestrator's `apprentices`).
function readAp(group_id: string, stage: LeaderReadinessStage) {
  return {
    id: `${group_id}-ap`,
    group_id,
    display_name: `Apprentice ${group_id}`,
    readiness_stage: stage,
  };
}

describe("buildCapacityBoard — status + badge", () => {
  it("labels status and flags ready-to-multiply only when full + Ready apprentice", () => {
    const rows = buildCapacityBoard({
      groups: [
        group({ id: "full-ready", capacity: 12 }),
        group({ id: "full-no-ready", capacity: 12 }),
        group({ id: "room", capacity: 12 }),
      ],
      overridesByGroup: new Map(),
      membershipCounts: new Map([
        ["full-ready", 12],
        ["full-no-ready", 12],
        ["room", 3],
      ]),
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
      apprenticesByGroup: new Map([
        ["full-ready", [boardAp("full-ready", "ready_to_lead")]],
        ["full-no-ready", [boardAp("full-no-ready", "in_training")]],
      ]),
    });
    const byId = new Map(rows.map((r) => [r.groupId, r]));
    expect(byId.get("full-ready")!.status).toBe("full");
    expect(byId.get("full-ready")!.readyToMultiply).toBe(true);
    // Full but no Ready apprentice → no badge.
    expect(byId.get("full-no-ready")!.status).toBe("full");
    expect(byId.get("full-no-ready")!.readyToMultiply).toBe(false);
    // Below target → Room, no badge.
    expect(byId.get("room")!.status).toBe("ok");
    expect(byId.get("room")!.readyToMultiply).toBe(false);
  });

  it("reports Open by choice (not Full) and still allows the badge when at/over target", () => {
    const rows = buildCapacityBoard({
      groups: [group({ id: "g", capacity: 12 })],
      overridesByGroup: new Map([
        ["g", override("g", { allow_over_capacity: true })],
      ]),
      membershipCounts: new Map([["g", 14]]),
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
      apprenticesByGroup: new Map([["g", [boardAp("g", "ready_to_lead")]]]),
    });
    expect(rows[0].status).toBe("open_by_choice");
    expect(rows[0].atOrOverTarget).toBe(true);
    expect(rows[0].readyToMultiply).toBe(true);
  });

  it("excludes non-active groups from the board", () => {
    const rows = buildCapacityBoard({
      groups: [
        group({ id: "active", capacity: 12 }),
        group({ id: "closed", capacity: 12, lifecycle_status: "closed" }),
      ],
      overridesByGroup: new Map(),
      membershipCounts: new Map(),
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
      apprenticesByGroup: new Map(),
    });
    expect(rows.map((r) => r.groupId)).toEqual(["active"]);
  });
});

describe("effective-target resolution (one source of truth)", () => {
  it("an override outranks groups.capacity for the displayed target (the divergence the Board edit fixes)", () => {
    const rows = buildCapacityBoard({
      groups: [group({ id: "g", capacity: 12 })],
      overridesByGroup: new Map([
        ["g", override("g", { capacity_override: 20 })],
      ]),
      membershipCounts: new Map([["g", 12]]),
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
      apprenticesByGroup: new Map(),
    });
    // 12 members against the effective target of 20 → Room, not Full.
    expect(rows[0].effectiveTarget).toBe(20);
    expect(rows[0].status).toBe("ok");
  });
});

describe("sortBoardByFullness", () => {
  it("orders fullest first, unknown-target last", () => {
    const rows = [
      { groupId: "a", groupName: "A", fillRatio: 0.5 },
      { groupId: "b", groupName: "B", fillRatio: 1.2 },
      { groupId: "c", groupName: "C", fillRatio: null },
    ] as CapacityBoardRow[];
    expect(sortBoardByFullness(rows).map((r) => r.groupId)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("filterBoard", () => {
  const rows = [
    { groupId: "a", segment: "Men", status: "full" },
    { groupId: "b", segment: "Women", status: "ok" },
  ] as CapacityBoardRow[];

  it("filters by segment and status independently", () => {
    expect(filterBoard(rows, { segment: "Men" }).map((r) => r.groupId)).toEqual(
      ["a"]
    );
    expect(filterBoard(rows, { status: "ok" }).map((r) => r.groupId)).toEqual([
      "b",
    ]);
    expect(filterBoard(rows, {}).length).toBe(2);
  });
});

// ADR 0029 decision 3: suggestions are no longer annotated with a "meets X/5"
// readiness figure (a pre-candidate group has no stored flags to assess), so
// they sort by group name alone.
describe("buildMultiplicationSuggestions (R9 — context, not a gate)", () => {
  it("suggests at/over-target groups with a Ready apprentice, sorted by name", () => {
    const rows = [
      {
        groupId: "g2",
        groupName: "High",
        segment: "Women",
        activeMemberCount: 13,
        effectiveTarget: 12,
        status: "full",
        readyToMultiply: true,
        readyApprentice: {
          id: "a2",
          displayName: "Bo",
          stage: "ready_to_lead",
        },
      },
      {
        groupId: "g1",
        groupName: "Low",
        segment: "Men",
        activeMemberCount: 12,
        effectiveTarget: 12,
        status: "full",
        readyToMultiply: true,
        readyApprentice: {
          id: "a1",
          displayName: "Al",
          stage: "ready_to_lead",
        },
      },
      {
        groupId: "g3",
        groupName: "NoBadge",
        readyToMultiply: false,
        readyApprentice: null,
      },
    ] as CapacityBoardRow[];
    const suggestions = buildMultiplicationSuggestions(rows, new Set(["g1"]));
    // Only the two badged groups; sorted by group name ("High" then "Low").
    expect(suggestions.map((s) => s.groupId)).toEqual(["g2", "g1"]);
    expect(suggestions.find((s) => s.groupId === "g1")!.alreadyCandidate).toBe(
      true
    );
  });
});

describe("buildCapacityBoardModel (orchestrator)", () => {
  it("ties the board + suggestions together from raw inputs", () => {
    const model = buildCapacityBoardModel({
      groups: [
        group({ id: "g1", capacity: 12, launched_on: "2020-01-01" }),
        group({ id: "g2", capacity: 12 }),
      ],
      overrides: [],
      memberships: [
        { group_id: "g1", status: "active" },
        { group_id: "g1", status: "active" },
        ...Array.from({ length: 12 }, () => ({
          group_id: "g1" as string,
          status: "active" as const,
        })),
      ],
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
      apprentices: [readAp("g1", "ready_to_lead")],
      candidateGroupIds: [],
    });
    const g1 = model.rows.find((r) => r.groupId === "g1")!;
    expect(g1.readyToMultiply).toBe(true);
    expect(model.suggestions.map((s) => s.groupId)).toContain("g1");
  });
});
