import { describe, expect, it } from "vitest";

import {
  EMPTY_CELL_HEALTH_GRADES,
  resolveCellHealth,
  tallyCellHealthGrades,
  type CellHealthGrades,
} from "@/lib/admin/cell-health";
import { cellKey } from "@/lib/admin/cell-coordinate";

// Pure tests for the per-cell health roll-up reader. The bucketer
// (tallyCellHealthGrades) is exercised against resolved grades in
// lib/supabase/__tests__/multiplication-health-grades.test.ts; here we pin the
// roll-up step resolveCellHealth applies on top of a bucketed tally.

const KEY = cellKey({ audience: "men", categoryId: "cat-1" });

function tallyWith(
  groupGrades: ("A" | "B" | "C" | "D" | "F")[],
  leaderGrades: ("A" | "B" | "C" | "D" | "F")[]
): CellHealthGrades {
  const out: CellHealthGrades = new Map();
  out.set(KEY, { groupGrades, leaderGrades });
  return out;
}

describe("resolveCellHealth — per-cell A–F roll-up", () => {
  it("rolls each pillar's grades up to one letter via the shared averaging", () => {
    // group: A(4)+C(2)=3.0 ⇒ B; leader: A+A+B = 11/3 ≈ 3.67 ⇒ A.
    const { groupHealth, leaderHealth } = resolveCellHealth(
      tallyWith(["A", "C"], ["A", "A", "B"]),
      KEY
    );
    expect(groupHealth).toBe("B");
    expect(leaderHealth).toBe("A");
  });

  it("returns null for a cell absent from the tally (renders as '—')", () => {
    expect(resolveCellHealth(EMPTY_CELL_HEALTH_GRADES, KEY)).toEqual({
      groupHealth: null,
      leaderHealth: null,
    });
  });

  it("returns null per pillar when only the other pillar has grades", () => {
    const { groupHealth, leaderHealth } = resolveCellHealth(
      tallyWith(["B"], []),
      KEY
    );
    expect(groupHealth).toBe("B");
    expect(leaderHealth).toBeNull();
  });

  it("reads only the requested cell's key", () => {
    const other = cellKey({ audience: "women", categoryId: "cat-1" });
    expect(resolveCellHealth(tallyWith(["A"], ["A"]), other)).toEqual({
      groupHealth: null,
      leaderHealth: null,
    });
  });
});

describe("tallyCellHealthGrades — bucketing into cells", () => {
  it("buckets group grades by cell and a leader into every cell they lead", () => {
    const menCat1 = cellKey({ audience: "men", categoryId: "cat-1" });
    const womenCat1 = cellKey({ audience: "women", categoryId: "cat-1" });
    const tally = tallyCellHealthGrades(
      [
        { type: "men", categoryId: "cat-1", isClosed: false, letter: "A" },
        { type: "women", categoryId: "cat-1", isClosed: false, letter: "C" },
      ],
      [{ cells: new Set([menCat1, womenCat1]), letter: "B" }]
    );
    expect(resolveCellHealth(tally, menCat1)).toEqual({
      groupHealth: "A",
      leaderHealth: "B",
    });
    expect(resolveCellHealth(tally, womenCat1)).toEqual({
      groupHealth: "C",
      leaderHealth: "B",
    });
  });

  it("drops closed, ungraded, and uncategorised group grades", () => {
    const tally = tallyCellHealthGrades(
      [
        { type: "men", categoryId: "cat-1", isClosed: true, letter: "A" },
        { type: "men", categoryId: "cat-1", isClosed: false, letter: null },
        { type: "men", categoryId: null, isClosed: false, letter: "A" },
        { type: null, categoryId: "cat-1", isClosed: false, letter: "A" },
      ],
      []
    );
    expect(tally.size).toBe(0);
  });
});
