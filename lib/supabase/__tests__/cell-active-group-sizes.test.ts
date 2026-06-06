import { describe, expect, it } from "vitest";
import {
  cellKeyString,
  tallyCellActiveGroupSizes,
} from "@/lib/supabase/multiplication-config-reads";

// Pure-aggregator tests for the per-CELL active group sizes read (#401). The read
// itself is a thin Supabase round-trip; the bucketing logic lives in
// tallyCellActiveGroupSizes, which is exercised here with bare rows. A cell =
// (audience_category) × (category_id); a group's size is its count of active
// memberships (the capacity-board count idiom).

function group(
  id: string,
  audience: "men" | "women" | "mixed" | null,
  categoryId: string | null,
  lifecycle = "active"
) {
  return {
    id,
    audience_category: audience,
    category_id: categoryId,
    lifecycle_status: lifecycle,
  };
}

function membership(groupId: string, status = "active") {
  return { group_id: groupId, status };
}

describe("tallyCellActiveGroupSizes — bucket active group sizes by cell", () => {
  it("buckets each active group's active-member count under its (audience, category) cell", () => {
    const groups = [
      group("g1", "men", "cat-a"),
      group("g2", "men", "cat-a"),
      group("g3", "women", "cat-b"),
    ];
    const memberships = [
      membership("g1"),
      membership("g1"),
      membership("g1"), // g1 has 3 active members
      membership("g2"), // g2 has 1
      membership("g3"),
      membership("g3"), // g3 has 2
    ];

    const result = tallyCellActiveGroupSizes(groups, memberships);
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([3, 1]);
    expect(result.byCell.get(cellKeyString("women", "cat-b"))).toEqual([2]);
    expect(result.keys.get(cellKeyString("men", "cat-a"))).toEqual({
      audience: "men",
      categoryId: "cat-a",
    });
  });

  it("counts only ACTIVE memberships toward a group's size", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", "men", "cat-a")],
      [
        membership("g1", "active"),
        membership("g1", "left"),
        membership("g1", "removed"),
      ]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([1]);
  });

  it("gives an active group with no active members a size of 0", () => {
    const result = tallyCellActiveGroupSizes([group("g1", "men", "cat-a")], []);
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([0]);
  });

  it("excludes non-active groups (only active groups form a cell)", () => {
    const result = tallyCellActiveGroupSizes(
      [
        group("g1", "men", "cat-a", "closed"),
        group("g2", "men", "cat-a", "paused"),
      ],
      [membership("g1"), membership("g2")]
    );
    expect(result.byCell.size).toBe(0);
  });

  it("excludes groups with no audience category (not in any cell)", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", null, "cat-a")],
      [membership("g1")]
    );
    expect(result.byCell.size).toBe(0);
  });

  it("buckets a null-category group under the audience's null-category cell (pre-#400)", () => {
    // Until groups.category_id lands (#400), category_id is null; the group still
    // forms a cell keyed on its audience with a null category.
    const result = tallyCellActiveGroupSizes(
      [group("g1", "mixed", null), group("g2", "mixed", null)],
      [membership("g1"), membership("g2"), membership("g2")]
    );
    expect(result.byCell.get(cellKeyString("mixed", null))).toEqual([1, 2]);
    expect(result.keys.get(cellKeyString("mixed", null))).toEqual({
      audience: "mixed",
      categoryId: null,
    });
  });
});
