import { describe, expect, it } from "vitest";
import {
  computeCellCapacityIssue,
  rollUpTypeCapacityIssue,
  UNIVERSAL_GROUP_CAP,
} from "@/lib/admin/cell-capacity";

// Pure-resolver tests for the per-cell capacity ISSUE (#401 / PRD §2.4 + §4). No
// DB: each facet is exercised with bare arrays of active group member counts.
//   * Facet A — over-capacity: any group > 12.
//   * Facet B — thin availability: <= 1 joinable group (a group < 12).
//   * Either facet alone trips the issue.
//   * Boundary at exactly 12: NOT over-capacity AND NOT joinable.

describe("computeCellCapacityIssue — Facet A (over-capacity)", () => {
  it("trips when any group is over the cap (> 12)", () => {
    // Two joinable groups (so Facet B is clear), but one is over the cap.
    const result = computeCellCapacityIssue([5, 6, 13]);
    expect(result.facetA).toBe(true);
    expect(result.isIssue).toBe(true);
  });

  it("does not trip Facet A when every group is at or under the cap", () => {
    // Three joinable groups, none over — Facet B clear, Facet A clear.
    const result = computeCellCapacityIssue([5, 8, 11]);
    expect(result.facetA).toBe(false);
    expect(result.facetB).toBe(false);
    expect(result.isIssue).toBe(false);
  });

  it("treats a group exactly at the cap (12) as NOT over-capacity", () => {
    // 12 is full but not OVER; with two other joinable groups Facet B is clear,
    // so the cell has no issue.
    const result = computeCellCapacityIssue([12, 5, 6]);
    expect(result.facetA).toBe(false);
    expect(result.isIssue).toBe(false);
  });
});

describe("computeCellCapacityIssue — Facet B (thin availability)", () => {
  it("trips when there is exactly one joinable group", () => {
    // One joinable group (5); the 12 and 13 are not joinable.
    const result = computeCellCapacityIssue([5, 12, 13]);
    expect(result.facetB).toBe(true);
    expect(result.isIssue).toBe(true);
  });

  it("trips when there are zero joinable groups (e.g. an empty cell)", () => {
    expect(computeCellCapacityIssue([]).facetB).toBe(true);
    expect(computeCellCapacityIssue([]).isIssue).toBe(true);
    // All groups full/over ⇒ none joinable ⇒ Facet B trips.
    const allFull = computeCellCapacityIssue([12, 12]);
    expect(allFull.facetB).toBe(true);
  });

  it("does not trip Facet B when there are two or more joinable groups", () => {
    const result = computeCellCapacityIssue([3, 9]);
    expect(result.facetB).toBe(false);
    expect(result.facetA).toBe(false);
    expect(result.isIssue).toBe(false);
  });

  it("treats a group exactly at the cap (12) as NOT joinable", () => {
    // Only the 11 is joinable (12 is full, not under) ⇒ one joinable ⇒ Facet B.
    const result = computeCellCapacityIssue([11, 12]);
    expect(result.facetB).toBe(true);
    expect(result.facetA).toBe(false);
    expect(result.isIssue).toBe(true);
  });
});

describe("computeCellCapacityIssue — either facet alone trips the issue", () => {
  it("trips on Facet A alone (over-capacity, ample joinable groups)", () => {
    // Three joinable groups (Facet B clear) but one over the cap (Facet A).
    const result = computeCellCapacityIssue([4, 5, 6, 14]);
    expect(result.facetA).toBe(true);
    expect(result.facetB).toBe(false);
    expect(result.isIssue).toBe(true);
  });

  it("trips on Facet B alone (thin availability, no over-capacity group)", () => {
    // One joinable group (Facet B) and nothing over the cap (Facet A clear).
    const result = computeCellCapacityIssue([7]);
    expect(result.facetA).toBe(false);
    expect(result.facetB).toBe(true);
    expect(result.isIssue).toBe(true);
  });

  it("trips when BOTH facets are present", () => {
    // One joinable group (Facet B) and one over the cap (Facet A).
    const result = computeCellCapacityIssue([8, 15]);
    expect(result.facetA).toBe(true);
    expect(result.facetB).toBe(true);
    expect(result.isIssue).toBe(true);
  });

  it("is no issue only when NEITHER facet trips", () => {
    // Two-plus joinable groups, none over the cap.
    const result = computeCellCapacityIssue([5, 6, 7]);
    expect(result.facetA).toBe(false);
    expect(result.facetB).toBe(false);
    expect(result.isIssue).toBe(false);
  });
});

describe("computeCellCapacityIssue — boundary at exactly the cap", () => {
  it("exposes the cap as 12", () => {
    expect(UNIVERSAL_GROUP_CAP).toBe(12);
  });

  it("a cell of only full (12) groups is an issue via Facet B, not Facet A", () => {
    const result = computeCellCapacityIssue([12, 12, 12]);
    expect(result.facetA).toBe(false); // 12 is not > 12
    expect(result.facetB).toBe(true); // none are < 12 ⇒ zero joinable
    expect(result.isIssue).toBe(true);
  });
});

describe("rollUpTypeCapacityIssue — any tripping cell flags the type", () => {
  it("flags the type when ANY cell trips (interim surface for the per-type board)", () => {
    // One healthy cell (two joinable, none over) and one thin cell (one joinable).
    const rollup = rollUpTypeCapacityIssue([[5, 6, 7], [7]]);
    expect(rollup.isIssue).toBe(true);
    expect(rollup.affectedCellCount).toBe(1);
    expect(rollup.cellCount).toBe(2);
  });

  it("does not flag the type when no cell trips", () => {
    const rollup = rollUpTypeCapacityIssue([
      [3, 4, 5],
      [6, 7, 8],
    ]);
    expect(rollup.isIssue).toBe(false);
    expect(rollup.affectedCellCount).toBe(0);
    expect(rollup.cellCount).toBe(2);
  });

  it("has no issue for a type with no active cells (nothing to multiply yet)", () => {
    const rollup = rollUpTypeCapacityIssue([]);
    expect(rollup.isIssue).toBe(false);
    expect(rollup.affectedCellCount).toBe(0);
    expect(rollup.cellCount).toBe(0);
  });

  it("counts every tripping cell when several trip", () => {
    // An over-capacity cell, a thin cell, and a healthy cell.
    const rollup = rollUpTypeCapacityIssue([[13, 4, 5], [9], [3, 4, 5]]);
    expect(rollup.isIssue).toBe(true);
    expect(rollup.affectedCellCount).toBe(2);
    expect(rollup.cellCount).toBe(3);
  });
});
