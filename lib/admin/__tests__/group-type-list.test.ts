import { describe, expect, it } from "vitest";
import {
  groupCellsByAudience,
  normalizeCategoryLabel,
  resolveCategoryForLabel,
  sortGroupTypeRows,
} from "@/lib/admin/group-type-list";
import type { CellCoverage } from "@/lib/admin/cell-coverage";
import type { GroupAudienceCategory } from "@/types/enums";

// The Settings › Groups create-flow + list helpers (#412). These pin the
// shared-catalog resolution (criterion 4: the same label under a second Audience
// reuses ONE category) and the stable list order, with no React / database.

const CAT = "cat-2030";
const FAM = "cat-fam";

describe("resolveCategoryForLabel — create flow dedupe (#412)", () => {
  const catalog = [
    { id: CAT, label: "20-30s" },
    { id: FAM, label: "Young families" },
  ];

  it("reuses an existing live category on an exact label match", () => {
    expect(resolveCategoryForLabel(catalog, "20-30s")).toEqual({
      kind: "existing",
      categoryId: CAT,
    });
  });

  it("matches case-insensitively and trims, mirroring the DB live-unique index", () => {
    expect(resolveCategoryForLabel(catalog, "  young FAMILIES ")).toEqual({
      kind: "existing",
      categoryId: FAM,
    });
  });

  it("treats an unseen label as new (created before the cell is applied)", () => {
    expect(resolveCategoryForLabel(catalog, "40-50s")).toEqual({ kind: "new" });
  });

  it("treats a blank label as new (the editor blocks save anyway)", () => {
    expect(resolveCategoryForLabel(catalog, "   ")).toEqual({ kind: "new" });
  });

  it("resolves the SAME id when a label already on one Audience is added to another", () => {
    // The catalog is shared: "20-30s" is live once. Adding it under a second
    // Audience resolves to that one category, so a later rename syncs across both.
    const first = resolveCategoryForLabel(catalog, "20-30s");
    const second = resolveCategoryForLabel(catalog, "20-30s");
    expect(first).toEqual({ kind: "existing", categoryId: CAT });
    expect(second).toEqual(first);
  });
});

describe("normalizeCategoryLabel", () => {
  it("lowercases and trims", () => {
    expect(normalizeCategoryLabel("  20-30S ")).toBe("20-30s");
  });
});

describe("sortGroupTypeRows — display order (#412)", () => {
  it("orders by label then Audience (Men's, Women's, Mixed)", () => {
    const rows = [
      { label: "Young families", audienceCategory: "mixed" as const },
      { label: "20-30s", audienceCategory: "women" as const },
      { label: "20-30s", audienceCategory: "men" as const },
    ];
    expect(sortGroupTypeRows(rows)).toEqual([
      { label: "20-30s", audienceCategory: "men" },
      { label: "20-30s", audienceCategory: "women" },
      { label: "Young families", audienceCategory: "mixed" },
    ]);
  });

  it("keeps shared-category rows adjacent and does not mutate the input", () => {
    const rows = [
      { label: "20-30s", audienceCategory: "women" as const },
      { label: "20-30s", audienceCategory: "men" as const },
    ];
    const sorted = sortGroupTypeRows(rows);
    expect(sorted.map((r) => r.audienceCategory)).toEqual(["men", "women"]);
    // Input array order is untouched (a new array is returned).
    expect(rows[0].audienceCategory).toBe("women");
  });
});

describe("groupCellsByAudience — audience boards", () => {
  // A minimal CellCoverage fixture; gap isn't read by the grouping but the type
  // requires it, so derive it the same way the builder would.
  function cell(
    audienceCategory: GroupAudienceCategory,
    label: string,
    have: number,
    target: number
  ): CellCoverage {
    return {
      audienceCategory,
      categoryId: `${audienceCategory}:${label}`,
      label,
      have,
      target,
      gap: Math.max(0, target - have),
    };
  }

  it("always returns the three boards in canonical order, even for no cells", () => {
    const boards = groupCellsByAudience([]);
    expect(boards.map((b) => b.audienceCategory)).toEqual([
      "men",
      "women",
      "mixed",
    ]);
    for (const board of boards) {
      expect(board.cells).toEqual([]);
      expect(board.haveTotal).toBe(0);
      expect(board.targetTotal).toBe(0);
    }
  });

  it("buckets each cell under its own audience board", () => {
    const boards = groupCellsByAudience([
      cell("men", "20-30s", 1, 2),
      cell("mixed", "Young families", 0, 1),
    ]);
    const byAudience = Object.fromEntries(
      boards.map((b) => [b.audienceCategory, b.cells.map((c) => c.label)])
    );
    expect(byAudience.men).toEqual(["20-30s"]);
    expect(byAudience.women).toEqual([]);
    expect(byAudience.mixed).toEqual(["Young families"]);
  });

  it("sorts each board's cells by label", () => {
    const [men] = groupCellsByAudience([
      cell("men", "Young families", 0, 0),
      cell("men", "20-30s", 0, 0),
    ]);
    expect(men.cells.map((c) => c.label)).toEqual(["20-30s", "Young families"]);
  });

  it("sums have and target across each board's cells", () => {
    const [men] = groupCellsByAudience([
      cell("men", "20-30s", 1, 3),
      cell("men", "40-50s", 2, 4),
    ]);
    expect(men.haveTotal).toBe(3);
    expect(men.targetTotal).toBe(7);
  });

  it("splits a shared label across the boards it's applied to", () => {
    const boards = groupCellsByAudience([
      cell("women", "20-30s", 0, 0),
      cell("men", "20-30s", 0, 0),
    ]);
    const men = boards.find((b) => b.audienceCategory === "men");
    const women = boards.find((b) => b.audienceCategory === "women");
    expect(men?.cells.map((c) => c.label)).toEqual(["20-30s"]);
    expect(women?.cells.map((c) => c.label)).toEqual(["20-30s"]);
  });

  it("does not mutate the input array", () => {
    const cells = [cell("women", "20-30s", 0, 0), cell("men", "20-30s", 0, 0)];
    groupCellsByAudience(cells);
    expect(cells.map((c) => c.audienceCategory)).toEqual(["women", "men"]);
  });
});
