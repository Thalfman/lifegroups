import { describe, expect, it } from "vitest";

import {
  APPRENTICE_NAME_FALLBACK,
  LEADER_READINESS_STAGES,
  apprenticeReadyBy,
  buildPipelineRollup,
  nextStage,
  resolveApprenticeNameSource,
  stageIndex,
  type ApprenticeView,
} from "@/lib/admin/leader-pipeline";

function apprentice(over: Partial<ApprenticeView>): ApprenticeView {
  return {
    id: over.id ?? "a1",
    groupId: over.groupId ?? "g1",
    groupName: over.groupName ?? "Group One",
    displayName: over.displayName ?? "Tony L.",
    memberId: over.memberId ?? null,
    stage: over.stage ?? "identified",
    expectedReadyOn: over.expectedReadyOn ?? null,
    notes: over.notes ?? null,
  };
}

// #754: the add-apprentice form's dropdown-vs-fallback branching. Picking a
// member derives the name from the member record (no name field); the explicit
// fallback reveals a free-text input; nothing selected is "none".
describe("resolveApprenticeNameSource", () => {
  const members = [
    { id: "m1", name: "Tony L." },
    { id: "m2", name: "Bo R." },
  ];

  it("derives the name from the member record when a member is picked", () => {
    expect(resolveApprenticeNameSource("m1", members)).toEqual({
      mode: "member",
      memberId: "m1",
      displayName: "Tony L.",
    });
  });

  it("reveals the free-text input on the explicit fallback choice", () => {
    expect(
      resolveApprenticeNameSource(APPRENTICE_NAME_FALLBACK, members)
    ).toEqual({ mode: "fallback" });
  });

  it("is 'none' when nothing is selected yet", () => {
    expect(resolveApprenticeNameSource("", members)).toEqual({ mode: "none" });
  });

  it("offers the fallback even when the group roster is empty (never blocks)", () => {
    // No members to pick — the fallback path is still available.
    expect(resolveApprenticeNameSource(APPRENTICE_NAME_FALLBACK, [])).toEqual({
      mode: "fallback",
    });
    expect(resolveApprenticeNameSource("", [])).toEqual({ mode: "none" });
  });

  it("treats an unknown id (stale selection) as 'none', not a member", () => {
    expect(resolveApprenticeNameSource("gone", members)).toEqual({
      mode: "none",
    });
  });
});

describe("stage ladder helpers", () => {
  it("orders the four stages canonically", () => {
    expect(LEADER_READINESS_STAGES).toEqual([
      "identified",
      "in_training",
      "ready_to_lead",
      "launched",
    ]);
  });

  it("advances to the next stage, stopping at launched", () => {
    expect(nextStage("identified")).toBe("in_training");
    expect(nextStage("in_training")).toBe("ready_to_lead");
    expect(nextStage("ready_to_lead")).toBe("launched");
    expect(nextStage("launched")).toBeNull();
  });

  it("indexes stages by ladder position", () => {
    expect(stageIndex("identified")).toBe(0);
    expect(stageIndex("launched")).toBe(3);
  });
});

describe("buildPipelineRollup", () => {
  it("groups apprentices by stage in canonical order, sorted by group name within a stage", () => {
    const rollup = buildPipelineRollup(
      [
        apprentice({
          id: "a",
          groupId: "g2",
          groupName: "Zed",
          stage: "ready_to_lead",
        }),
        apprentice({
          id: "b",
          groupId: "g1",
          groupName: "Acme",
          stage: "ready_to_lead",
        }),
        apprentice({
          id: "c",
          groupId: "g3",
          groupName: "Beta",
          stage: "identified",
        }),
      ],
      [
        { id: "g1", name: "Acme" },
        { id: "g2", name: "Zed" },
        { id: "g3", name: "Beta" },
      ]
    );
    expect(rollup.stages.map((s) => s.stage)).toEqual(LEADER_READINESS_STAGES);
    const ready = rollup.stages.find((s) => s.stage === "ready_to_lead")!;
    expect(ready.apprentices.map((a) => a.groupName)).toEqual(["Acme", "Zed"]);
    expect(rollup.totalApprentices).toBe(3);
  });

  it("surfaces active groups with no apprentice as the gap, sorted by name", () => {
    const rollup = buildPipelineRollup(
      [apprentice({ groupId: "g1" })],
      [
        { id: "g1", name: "Has One" },
        { id: "g3", name: "Zeta Gap" },
        { id: "g2", name: "Alpha Gap" },
      ]
    );
    expect(rollup.groupsWithoutApprentice.map((g) => g.groupName)).toEqual([
      "Alpha Gap",
      "Zeta Gap",
    ]);
  });

  it("reports every stage section even when empty", () => {
    const rollup = buildPipelineRollup([], [{ id: "g1", name: "Lonely" }]);
    expect(rollup.stages).toHaveLength(4);
    expect(rollup.stages.every((s) => s.apprentices.length === 0)).toBe(true);
    expect(rollup.groupsWithoutApprentice).toHaveLength(1);
  });
});

describe("apprenticeReadyBy (staffing-supply predicate)", () => {
  const target = "2026-08-01";

  it("counts an apprentice already Ready to lead", () => {
    expect(
      apprenticeReadyBy(
        { stage: "ready_to_lead", expectedReadyOn: null },
        target
      )
    ).toBe(true);
  });

  it("counts an in-training apprentice projected ready by the target date", () => {
    expect(
      apprenticeReadyBy(
        { stage: "in_training", expectedReadyOn: "2026-07-15" },
        target
      )
    ).toBe(true);
    expect(
      apprenticeReadyBy(
        { stage: "in_training", expectedReadyOn: "2026-08-01" },
        target
      )
    ).toBe(true);
  });

  it("excludes an apprentice whose expected-ready date is after the target", () => {
    expect(
      apprenticeReadyBy(
        { stage: "in_training", expectedReadyOn: "2026-09-01" },
        target
      )
    ).toBe(false);
  });

  it("excludes an identified apprentice with no expected-ready date", () => {
    expect(
      apprenticeReadyBy({ stage: "identified", expectedReadyOn: null }, target)
    ).toBe(false);
  });

  it("never counts a launched apprentice — they already lead a group", () => {
    expect(
      apprenticeReadyBy(
        { stage: "launched", expectedReadyOn: "2025-01-01" },
        target
      )
    ).toBe(false);
  });
});
