import { describe, expect, it } from "vitest";

import {
  bucketGroupsBySegment,
  segmentLabel,
  UNCATEGORIZED_SEGMENT,
  type SegmentableGroup,
} from "@/lib/admin/multiplication";

// #398: groups carry a free-form category (its cell under the top type) and the
// segmentation surface buckets them by audience × category label, with untagged
// groups collected in a visible "Uncategorized" bucket so none are lost.
// bucketGroupsBySegment is the pure helper that surface renders.

function g(over: Partial<SegmentableGroup> & { id: string }): SegmentableGroup {
  return {
    id: over.id,
    name: over.name ?? `Group ${over.id}`,
    audienceCategory: over.audienceCategory ?? null,
    categoryLabel: over.categoryLabel ?? null,
  };
}

describe("bucketGroupsBySegment (#398)", () => {
  it("resolves a tagged group into its '<category> × <type>' cell", () => {
    const buckets = bucketGroupsBySegment([
      g({ id: "1", audienceCategory: "men", categoryLabel: "20-30s" }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].segment).toBe("Men · 20-30s");
    expect(buckets[0].groups.map((x) => x.id)).toEqual(["1"]);
  });

  it("groups multiple groups of the same cell together", () => {
    const buckets = bucketGroupsBySegment([
      g({ id: "1", audienceCategory: "women", categoryLabel: "40-50s" }),
      g({ id: "2", audienceCategory: "women", categoryLabel: "40-50s" }),
    ]);
    const cell = buckets.find((b) => b.segment === "Women · 40-50s");
    expect(cell?.groups.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("collects untagged groups into a visible Uncategorized bucket", () => {
    const buckets = bucketGroupsBySegment([
      g({ id: "tagged", audienceCategory: "men", categoryLabel: "20-30s" }),
      g({ id: "untagged", audienceCategory: null, categoryLabel: null }),
    ]);
    const uncategorized = buckets.find(
      (b) => b.segment === UNCATEGORIZED_SEGMENT
    );
    expect(uncategorized).toBeDefined();
    expect(uncategorized?.groups.map((x) => x.id)).toEqual(["untagged"]);
  });

  it("never drops an untagged group — it is bucketed, not lost", () => {
    const buckets = bucketGroupsBySegment([
      g({ id: "a", audienceCategory: null, categoryLabel: null }),
      g({ id: "b", audienceCategory: null, categoryLabel: null }),
    ]);
    const allBucketed = buckets.flatMap((b) => b.groups.map((x) => x.id));
    expect(allBucketed.sort()).toEqual(["a", "b"]);
  });

  it("sorts cells alphabetically with Uncategorized always last", () => {
    const buckets = bucketGroupsBySegment([
      g({ id: "u", audienceCategory: null, categoryLabel: null }),
      g({ id: "w", audienceCategory: "women", categoryLabel: "Retirement" }),
      g({ id: "m", audienceCategory: "men", categoryLabel: "20-30s" }),
    ]);
    expect(buckets.map((b) => b.segment)).toEqual([
      "Men · 20-30s",
      "Women · Retirement",
      UNCATEGORIZED_SEGMENT,
    ]);
  });

  it("buckets a tagged-but-audienceless group by its label under Uncategorized", () => {
    // No audience means no cell, but the label still reads — it lands in the
    // Uncategorized family rather than vanishing.
    expect(segmentLabel(null, "20-30s")).toBe("Uncategorized · 20-30s");
    const buckets = bucketGroupsBySegment([
      g({ id: "1", audienceCategory: null, categoryLabel: "20-30s" }),
    ]);
    expect(buckets[0].segment).toBe("Uncategorized · 20-30s");
  });
});
