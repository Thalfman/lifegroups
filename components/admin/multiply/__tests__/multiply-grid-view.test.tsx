import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiplyGridView } from "@/components/admin/multiply/multiply-grid";
import { GRID_TYPES, type MultiplyGridRow } from "@/lib/admin/multiply-grid";
import type { GroupAudienceCategory } from "@/types/enums";

// A row with no applied cells (all three top types blank) — an "empty" category.
function emptyRow(id: string, label: string): MultiplyGridRow {
  const cells = Object.fromEntries(
    GRID_TYPES.map((type) => [
      type,
      {
        categoryId: id,
        audienceCategory: type as GroupAudienceCategory,
        applied: false,
        readout: null,
      },
    ])
  ) as MultiplyGridRow["cells"];
  return { categoryId: id, label, cells };
}

// A row with one applied (active) cell under the "men" top type.
function activeRow(id: string, label: string): MultiplyGridRow {
  const row = emptyRow(id, label);
  row.cells.men = {
    categoryId: id,
    audienceCategory: "men",
    applied: true,
    readout: {
      signal: { ready: true, outcomes: [], blockers: [] },
      coverage: { have: 2, target: 3 },
    },
  };
  return row;
}

describe("MultiplyGridView — show-only-active filter (#647)", () => {
  it("defaults to active-only and hides empty rows when many are empty", () => {
    const grid = {
      rows: [
        activeRow("c-active", "Young Adults"),
        emptyRow("c-1", "Empty One"),
        emptyRow("c-2", "Empty Two"),
        emptyRow("c-3", "Empty Three"),
      ],
    };

    const html = renderToStaticMarkup(
      <MultiplyGridView grid={grid} ministryYear={2026} />
    );

    // The toggle renders, defaulted on, and reports the hidden count.
    expect(html).toContain("Show only active cells");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain("(3 hidden)");
    // The active row is shown; the empty rows are filtered out.
    expect(html).toContain("Young Adults");
    expect(html).not.toContain("Empty One");
  });

  it("omits the toggle entirely when no row is empty", () => {
    const grid = {
      rows: [activeRow("c-a", "Alpha"), activeRow("c-b", "Beta")],
    };

    const html = renderToStaticMarkup(
      <MultiplyGridView grid={grid} ministryYear={2026} />
    );

    expect(html).not.toContain("Show only active cells");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });
});
