import { describe, expect, it } from "vitest";

import { bucketActiveCategoryOptions } from "@/lib/supabase/group-categories-reads";
import type { GroupAudienceCategory } from "@/types/enums";

// #399: the intake form's "interested in: category" options per top type — the
// pure bucketer that turns the (cell + catalog category) join into the
// per-top-type option lists. Only ACTIVE cells whose category is live count;
// options come out sorted by label.

type Row = {
  audience_category: GroupAudienceCategory;
  category_id: string;
  active: boolean;
  category: { label: string; archived_at: string | null } | null;
};

function cell(over: Partial<Row>): Row {
  return {
    audience_category: "men",
    category_id: "c1",
    active: true,
    category: { label: "20-30s", archived_at: null },
    ...over,
  };
}

describe("bucketActiveCategoryOptions (#399)", () => {
  it("buckets an active cell's category under its top type", () => {
    const out = bucketActiveCategoryOptions([cell({})]);
    expect(out.men).toEqual([{ id: "c1", label: "20-30s" }]);
    expect(out.women).toEqual([]);
    expect(out.mixed).toEqual([]);
  });

  it("drops inactive cells", () => {
    const out = bucketActiveCategoryOptions([cell({ active: false })]);
    expect(out.men).toEqual([]);
  });

  it("drops cells whose category is archived", () => {
    const out = bucketActiveCategoryOptions([
      cell({ category: { label: "Old", archived_at: "2026-01-01" } }),
    ]);
    expect(out.men).toEqual([]);
  });

  it("drops cells whose category failed to join", () => {
    const out = bucketActiveCategoryOptions([cell({ category: null })]);
    expect(out.men).toEqual([]);
  });

  it("sorts each top type's options by label", () => {
    const out = bucketActiveCategoryOptions([
      cell({
        category_id: "b",
        category: { label: "Young families", archived_at: null },
      }),
      cell({
        category_id: "a",
        category: { label: "20-30s", archived_at: null },
      }),
    ]);
    expect(out.men.map((o) => o.label)).toEqual(["20-30s", "Young families"]);
  });

  it("places the same category under each top type it has an active cell for", () => {
    const out = bucketActiveCategoryOptions([
      cell({ audience_category: "men", category_id: "c1" }),
      cell({ audience_category: "women", category_id: "c1" }),
    ]);
    expect(out.men).toEqual([{ id: "c1", label: "20-30s" }]);
    expect(out.women).toEqual([{ id: "c1", label: "20-30s" }]);
  });

  it("de-duplicates a category that somehow has two active cells for one type", () => {
    const out = bucketActiveCategoryOptions([cell({}), cell({})]);
    expect(out.men).toEqual([{ id: "c1", label: "20-30s" }]);
  });
});
