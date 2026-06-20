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
  it("defaults to the Readiness tab (the landing signal) for an absent param", () => {
    expect(resolveMultiplyInitialTab(undefined)).toBe("readiness");
  });

  it("accepts each known tab key", () => {
    expect(resolveMultiplyInitialTab("readiness")).toBe("readiness");
    expect(resolveMultiplyInitialTab("pipeline")).toBe("pipeline");
    expect(resolveMultiplyInitialTab("leaders")).toBe("leaders");
  });

  it("resolves the legacy `plan` key to Pipeline (ADR 0030 alias)", () => {
    // Old deep-links and bookmarks used `?tab=plan`; keep them working by
    // resolving to the renamed Pipeline tab.
    expect(resolveMultiplyInitialTab("plan")).toBe("pipeline");
  });

  it("lands an unrecognized value somewhere coherent: the Readiness tab", () => {
    expect(resolveMultiplyInitialTab("calendar")).toBe("readiness");
    expect(resolveMultiplyInitialTab("")).toBe("readiness");
  });

  it("reads only the first value of a repeated query param", () => {
    expect(resolveMultiplyInitialTab(["leaders", "pipeline"])).toBe("leaders");
    // The legacy alias still resolves when it is the first value.
    expect(resolveMultiplyInitialTab(["plan", "leaders"])).toBe("pipeline");
    // An unrecognized first value still falls back to Readiness — the later
    // (recognized) duplicate is deliberately ignored.
    expect(resolveMultiplyInitialTab(["bogus", "leaders"])).toBe("readiness");
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
