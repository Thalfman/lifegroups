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

function coLeader(
  groupId: string,
  assignedAt: string | null,
  role: string | null = "co_leader",
  status: string | null = "active"
) {
  return {
    group_id: groupId,
    assigned_at: assignedAt,
    profile: { role, status },
  };
}

function membership(groupId: string, status = "active") {
  return { group_id: groupId, status };
}

function manualCount(groupId: string, count: number | null) {
  return { group_id: groupId, manual_member_count: count };
}

function cell(
  audience: "men" | "women" | "mixed",
  categoryId: string
): CellKey {
  return { audience, categoryId };
}

describe("tallyCellMaturity — per-cell max member count + tenures", () => {
  it("takes the MAX group tenure across the cell's groups (the oldest group wins)", () => {
    const result = tallyCellMaturity(
      [
        group("g1", "men", "cat-a", "2024-01-01"), // ~2 years
        group("g2", "men", "cat-a", "2020-01-01"), // ~6 years
      ],
      [],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
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
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("ignores a stale co-leader whose profile is no longer a leader (os7)", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2018-01-01", "member"), // longest-serving but demoted
        coLeader("g1", "2024-06-01", "co_leader"), // the real co-leader → ~2 yrs
      ],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    // The demoted row is skipped, so tenure comes from the active co-leader (2),
    // not the stale 2018 assignment (~8).
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("ignores a deactivated co-leader (status inactive) even with role co_leader", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2018-01-01", "co_leader", "inactive"), // deactivated
        coLeader("g1", "2024-06-01", "co_leader", "active"), // the active one → 2
      ],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("prefers the Julian-fed manual count over the roster, maxed across the cell (ADR 0022)", () => {
    const result = tallyCellMaturity(
      [
        group("g1", "men", "cat-a", "2024-01-01"),
        group("g2", "men", "cat-a", "2024-01-01"),
      ],
      [],
      // g1 has 2 active roster members but a manual override of 14; g2 has 3
      // roster members and no override.
      [
        membership("g1"),
        membership("g1"),
        membership("g2"),
        membership("g2"),
        membership("g2"),
      ],
      [manualCount("g1", 14)],
      [cell("men", "cat-a")],
      TODAY
    );
    // Effective: g1 = 14 (manual wins), g2 = 3 (roster) → cell max 14.
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(14);
  });

  it("falls back to the active roster count when no manual count is set", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", "2024-01-01")],
      [],
      [membership("g1"), membership("g1"), membership("g1", "left")],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    // Only the two ACTIVE memberships count.
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(2);
  });

  it("seeds a cell with no qualifying group at 0 members / null tenures", () => {
    const result = tallyCellMaturity(
      [],
      [],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
  });

  it("keeps group tenure null when the group has no launch date", () => {
    const result = tallyCellMaturity(
      [group("g1", "men", "cat-a", null)],
      [coLeader("g1", "2020-01-01")],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
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
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
    expect(result.byCell.has(keyOf("men", "cat-x"))).toBe(false);
  });
});
