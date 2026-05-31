import { describe, expect, it } from "vitest";
import {
  resolveGroupGradeBoard,
  type ComputedGroupGrade,
} from "@/lib/admin/group-health-grades";
import type { GradeOverride } from "@/lib/admin/group-health-override";

const PERIOD = "2026-05-01";

const groups: ComputedGroupGrade[] = [
  { group_id: "g-c", group_name: "Cedar", computed_letter: "C" },
  { group_id: "g-a", group_name: "Aspen", computed_letter: "A" },
  { group_id: "g-x", group_name: "Birch", computed_letter: null },
];

describe("resolveGroupGradeBoard", () => {
  it("ranks by computed letter and buckets ungraded groups separately when there are no overrides", () => {
    const board = resolveGroupGradeBoard(groups, new Map(), PERIOD);

    // Best-to-worst by effective grade, ungraded last.
    expect(board.ranked.map((r) => r.group_id)).toEqual(["g-a", "g-c", "g-x"]);
    // With no override, effective === computed throughout.
    expect(board.ranked.every((r) => !r.resolved.is_overridden)).toBe(true);
    expect(
      board.segmented.segments.find((s) => s.letter === "A")?.groups
    ).toHaveLength(1);
    expect(board.segmented.unassessed.map((g) => g.group_id)).toEqual(["g-x"]);
  });

  it("applies an active override and ranks by the effective letter, not the computed one", () => {
    // Cedar is computed C but overridden to A for this period: it should rank
    // ahead of Aspen (ties broken by name) and land in the A bucket.
    const overrides = new Map<string, GradeOverride | null>([
      ["g-c", { letter: "A", scope: "this_month", period_month: PERIOD }],
    ]);

    const board = resolveGroupGradeBoard(groups, overrides, PERIOD);

    const cedar = board.ranked.find((r) => r.group_id === "g-c")!;
    expect(cedar.resolved.is_overridden).toBe(true);
    expect(cedar.resolved.effective_letter).toBe("A");
    expect(cedar.resolved.computed_letter).toBe("C");
    // Aspen and Cedar both effective-A; Aspen sorts first by name.
    expect(board.ranked.map((r) => r.group_id)).toEqual(["g-a", "g-c", "g-x"]);
    expect(
      board.segmented.segments
        .find((s) => s.letter === "A")
        ?.groups.map((g) => g.group_id)
    ).toEqual(["g-a", "g-c"]);
  });

  it("ignores an expired this_month override (effective falls back to computed)", () => {
    const overrides = new Map<string, GradeOverride | null>([
      ["g-c", { letter: "A", scope: "this_month", period_month: "2026-04-01" }],
    ]);

    const board = resolveGroupGradeBoard(groups, overrides, PERIOD);

    const cedar = board.ranked.find((r) => r.group_id === "g-c")!;
    expect(cedar.resolved.is_overridden).toBe(false);
    expect(cedar.resolved.effective_letter).toBe("C");
  });
});
