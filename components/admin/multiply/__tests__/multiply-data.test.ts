import { describe, expect, it } from "vitest";

import {
  currentMinistryYear,
  resolveMultiplyInitialTab,
} from "@/components/admin/multiply/multiply-data";

// multiply-data.ts carries the Multiply area's PURE helpers — it has no reads
// seam of its own (the old per-type board loader folded into the grid loader,
// #403; see multiply-grid-data.test.ts for that seam's adapter suite). What
// remains is the tab resolver the server page shares with the shell and the
// off-season-clamping ministry-year variant.

describe("resolveMultiplyInitialTab", () => {
  it("defaults to the Plan tab (Julian's working view) for an absent param", () => {
    expect(resolveMultiplyInitialTab(undefined)).toBe("plan");
  });

  it("accepts each known tab key", () => {
    expect(resolveMultiplyInitialTab("plan")).toBe("plan");
    expect(resolveMultiplyInitialTab("readiness")).toBe("readiness");
    expect(resolveMultiplyInitialTab("leaders")).toBe("leaders");
  });

  it("lands an unrecognized value somewhere coherent: the Plan tab", () => {
    expect(resolveMultiplyInitialTab("calendar")).toBe("plan");
    expect(resolveMultiplyInitialTab("")).toBe("plan");
  });

  it("reads only the first value of a repeated query param", () => {
    expect(resolveMultiplyInitialTab(["leaders", "plan"])).toBe("leaders");
    // An unrecognized first value still falls back to Plan — the later
    // (recognized) duplicate is deliberately ignored.
    expect(resolveMultiplyInitialTab(["bogus", "leaders"])).toBe("plan");
  });
});

describe("currentMinistryYear (Multiply's off-season-clamping variant)", () => {
  it("uses the August-start year inside a ministry year", () => {
    // Aug–Dec belong to that calendar year's ministry year…
    expect(currentMinistryYear(new Date("2026-09-15T12:00:00Z"))).toBe(2026);
    expect(currentMinistryYear(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
    // …and Jan–May to the previous one (the August that started the span).
    expect(currentMinistryYear(new Date("2026-03-15T12:00:00Z"))).toBe(2025);
  });

  it("plans for the year whose August is next during the Jun/Jul off-season", () => {
    // Unlike lib/admin/ministry-year's nullable helper, the Multiply surface
    // is never blank in summer: the off-season clamps to the calendar year.
    expect(currentMinistryYear(new Date("2026-06-11T12:00:00Z"))).toBe(2026);
    expect(currentMinistryYear(new Date("2026-07-31T23:59:59Z"))).toBe(2026);
  });
});
