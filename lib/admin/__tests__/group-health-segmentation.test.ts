import { describe, it, expect } from "vitest";
import {
  segmentByGrade,
  rankByGrade,
} from "@/lib/admin/group-health-segmentation";

describe("segmentByGrade — dashboard segmentation", () => {
  it("buckets groups into A–F segments in grade order", () => {
    const { segments } = segmentByGrade([
      { group_id: "g1", group_name: "Alpha", letter: "C" },
      { group_id: "g2", group_name: "Bravo", letter: "A" },
      { group_id: "g3", group_name: "Charlie", letter: "C" },
    ]);

    // F (ADR 0018, no E) joins the ladder after D as the failing grade.
    expect(segments.map((s) => s.letter)).toEqual(["A", "B", "C", "D", "F"]);
    expect(segments[0].groups.map((g) => g.group_id)).toEqual(["g2"]);
    expect(segments[1].groups).toEqual([]);
    expect(segments[2].groups.map((g) => g.group_id)).toEqual(["g1", "g3"]);
    expect(segments[3].groups).toEqual([]);
    expect(segments[4].groups).toEqual([]);
  });

  it("keeps ungraded groups out of the ladder, in their own bucket", () => {
    const { segments, unassessed } = segmentByGrade([
      { group_id: "g1", group_name: "Alpha", letter: "B" },
      { group_id: "g2", group_name: "Bravo", letter: null },
    ]);

    expect(segments.flatMap((s) => s.groups).map((g) => g.group_id)).toEqual([
      "g1",
    ]);
    expect(unassessed.map((g) => g.group_id)).toEqual(["g2"]);
  });

  it("orders groups within a segment by name, whatever order they arrive in", () => {
    const { segments } = segmentByGrade([
      { group_id: "g1", group_name: "Zeta", letter: "B" },
      { group_id: "g2", group_name: "Alpha", letter: "B" },
      { group_id: "g3", group_name: "Mike", letter: "B" },
    ]);

    expect(segments[1].groups.map((g) => g.group_name)).toEqual([
      "Alpha",
      "Mike",
      "Zeta",
    ]);
  });
});

describe("rankByGrade — best-to-worst ranking", () => {
  it("ranks groups A→D, ungraded last, name breaking ties", () => {
    const ranked = rankByGrade([
      { group_id: "g1", group_name: "Charlie", letter: "C" },
      { group_id: "g2", group_name: "Bravo", letter: null },
      { group_id: "g3", group_name: "Alpha", letter: "A" },
      { group_id: "g4", group_name: "Delta", letter: "C" },
    ]);

    expect(ranked.map((g) => g.group_id)).toEqual(["g3", "g1", "g4", "g2"]);
  });
});
