import { describe, expect, it } from "vitest";
import {
  evaluateReadiness,
  segmentLabel,
  wholeYearsBetween,
} from "@/lib/admin/multiplication";

const TODAY = "2026-05-28";

describe("wholeYearsBetween", () => {
  it("counts whole years, anniversary-aware", () => {
    expect(wholeYearsBetween("2023-05-28", TODAY)).toBe(3);
    expect(wholeYearsBetween("2023-05-29", TODAY)).toBe(2); // anniversary not reached
    expect(wholeYearsBetween("2026-05-28", TODAY)).toBe(0);
  });

  it("returns null for missing or malformed dates", () => {
    expect(wholeYearsBetween(null, TODAY)).toBeNull();
    expect(wholeYearsBetween("not-a-date", TODAY)).toBeNull();
  });
});

describe("evaluateReadiness (Julian P4 answer 10 criteria)", () => {
  it("marks all criteria met for a ripe group", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 14,
        launchedOn: "2022-01-01", // 4+ years
        coShepherdSince: "2024-01-01", // 2+ years
        shepherdWilling: true,
        needsSimilarStage: true,
      },
      TODAY,
    );
    expect(r.criteria).toEqual({
      enough_members: true,
      established_long_enough: true,
      co_shepherd_tenured: true,
      shepherd_willing: true,
      needs_similar_stage: true,
    });
    expect(r.metCount).toBe(5);
    expect(r.totalCount).toBe(5);
  });

  it("flags unmet criteria independently at their boundaries", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 11, // below 12
        launchedOn: "2024-06-01", // < 3 years
        coShepherdSince: null, // no co-shepherd
        shepherdWilling: false,
        needsSimilarStage: false,
      },
      TODAY,
    );
    expect(r.criteria.enough_members).toBe(false);
    expect(r.criteria.established_long_enough).toBe(false);
    expect(r.criteria.co_shepherd_tenured).toBe(false);
    expect(r.metCount).toBe(0);
  });

  it("treats exactly 12 members and exactly 3 years as met", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 12,
        launchedOn: "2023-05-28",
        coShepherdSince: "2025-05-28",
        shepherdWilling: false,
        needsSimilarStage: false,
      },
      TODAY,
    );
    expect(r.criteria.enough_members).toBe(true);
    expect(r.criteria.established_long_enough).toBe(true);
    expect(r.criteria.co_shepherd_tenured).toBe(true);
  });
});

describe("segmentLabel", () => {
  it("combines audience and life stage", () => {
    expect(segmentLabel("mixed", "retirement")).toBe("Mixed / couples · Retirement");
    expect(segmentLabel("men", null)).toBe("Men");
    expect(segmentLabel(null, null)).toBe("Unsegmented");
  });
});
