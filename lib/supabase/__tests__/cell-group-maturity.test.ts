import { describe, expect, it } from "vitest";
import {
  tallyCellMaturity,
  type CellKey,
} from "@/lib/supabase/multiplication-config-reads";
import { cellKey } from "@/lib/admin/cell-coordinate";

// Pure-aggregator tests for the per-CELL group maturity read (#483) — the inputs
// to the group-tenure and Co-Leader-tenure readiness pillars. A cell is "ready to
// multiply" when its STRONGEST group is, so each cell carries the MAX whole-years
// tenure across its active, categorised groups. Group tenure reads
// groups.launched_on; Co-Leader tenure reads the EARLIEST active co_leader's
// group_leaders.assigned_at (the longest-serving co-leader). An ungrounded cell
// stays null. Same considered-cells discipline as the sizes read.

const TODAY = "2026-06-19";

const keyOf = (
  audience: "men" | "women" | "mixed",
  categoryId: string
): string => cellKey({ audience, categoryId });

function group(
  id: string,
  audience: "men" | "women" | "mixed" | null,
  categoryId: string | null,
  launchedOn: string | null,
  lifecycle = "active"
) {
  return {
    id,
    audience_category: audience,
    category_id: categoryId,
    lifecycle_status: lifecycle,
    launched_on: launchedOn,
  };
}

function coLeader(groupId: string, assignedAt: string | null) {
  return { group_id: groupId, assigned_at: assignedAt };
}

function cell(
  audience: "men" | "women" | "mixed",
  categoryId: string
): CellKey {
  return { audience, categoryId };
}

describe("tallyCellMaturity — per-cell max group + Co-Leader tenure", () => {
  it("takes the MAX group tenure across the cell's groups (the oldest group wins)", () => {
    const result = tallyCellMaturity(
      [
        group("g1", "men", "cat-a", "2024-01-01"), // ~2 years
        group("g2", "men", "cat-a", "2020-01-01"), // ~6 years
      ],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      groupTenureYears: 6,
      coShepherdTenureYears: null,
    });
  });

  it("reads Co-Leader tenure from the EARLIEST active co_leader of any group", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2024-06-01"), // ~2 years
        coLeader("g1", "2025-06-01"), // ~1 year — earliest wins → 2 years
      ],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("keeps tenure null for a cell with no qualifying group (ungrounded → blocks if required)", () => {
    const result = tallyCellMaturity([], [], [cell("men", "cat-a")], TODAY);
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
  });

  it("keeps group tenure null when the group has no launch date", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", null)],
      [coLeader("g1", "2020-01-01")],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      groupTenureYears: null,
      coShepherdTenureYears: 6,
    });
  });

  it("ignores non-active, uncategorized, and off-matrix groups", () => {
    const result = tallyCellMaturity(
      [
        group("g1", "men", "cat-a", "2010-01-01", "closed"), // not active
        group("g2", "men", null, "2010-01-01"), // uncategorized
        group("g3", "men", "cat-x", "2010-01-01"), // not an active cell
      ],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
    expect(result.byCell.has(keyOf("men", "cat-x"))).toBe(false);
  });
});
