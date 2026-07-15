import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTE_REGISTRY,
  CANONICAL_AREA_LABELS,
  canonicalFor,
  movedToFor,
} from "@/lib/nav/route-registry";

// "This moved" affordances for the frozen pre-pivot surfaces (#901). Two gate
// styles share one mapping source — the registry's `canonical` field:
//
//   * flag-gated family (guests, check-ins): the layout's frozenSurfaceGate
//     redirects to canonicalFor(<route>) while the flag is off;
//   * always-off-nav family (leader-pipeline, group-health, calendar,
//     launch-planning): the page stays a 200 (ADR 0033 alias-render) and its
//     FrozenSurfaceBanner carries the movedToFor(<route>) link.
//
// These tests pin (a) the derivation helpers and (b) that every frozen entry
// point references ITS OWN registry path, so a page's target can never fork
// from lib/nav/route-registry.

describe("canonicalFor / movedToFor derive from the registry", () => {
  it("returns the recorded canonical for a frozen route", () => {
    expect(canonicalFor("/admin/guests")).toBe("/admin/plan");
    expect(canonicalFor("/admin/check-ins")).toBe("/admin/care");
    expect(canonicalFor("/admin/calendar")).toBe("/admin/multiply");
  });

  it("returns null for routes without a canonical (ADR 0033 Planning host)", () => {
    expect(canonicalFor("/admin/planning")).toBeNull();
    expect(movedToFor("/admin/planning")).toBeNull();
    expect(canonicalFor("/admin/not-a-route")).toBeNull();
  });

  it("labels every canonical a frozen surface points at, in current vocabulary", () => {
    const frozenCanonicals = new Set(
      ADMIN_ROUTE_REGISTRY.filter(
        (e) => e.status === "frozen" && e.canonical
      ).map((e) => e.canonical as string)
    );
    for (const canonical of frozenCanonicals) {
      expect(
        CANONICAL_AREA_LABELS[canonical],
        `missing CANONICAL_AREA_LABELS entry for ${canonical}`
      ).toBeTruthy();
    }
    // Retired vocabulary must never leak into moved-to copy.
    for (const label of Object.values(CANONICAL_AREA_LABELS)) {
      expect(label).not.toMatch(/guest|check-?in/i);
    }
  });

  it("movedToFor pairs the canonical href with its label", () => {
    expect(movedToFor("/admin/guests")).toEqual({
      href: "/admin/plan",
      label: "Plan — the Interest Funnel",
    });
    expect(movedToFor("/admin/group-health")).toEqual({
      href: "/admin/care",
      label: "Care",
    });
  });
});

// Source pins: each frozen entry point references the registry helper with its
// own route literal. Reading the page source (the planning-alias-render
// pattern) keeps this a pure unit test — no server rendering needed.
const APP = "../../../app/(protected)/admin";

function read(relPath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`${APP}/${relPath}`, import.meta.url)),
    "utf8"
  );
}

describe("frozen entry points derive their moved-to target from the registry", () => {
  it.each([
    ["guests/page.tsx", 'movedToFor("/admin/guests")'],
    ["check-ins/page.tsx", 'movedToFor("/admin/check-ins")'],
    [
      "check-ins/[groupId]/page.tsx",
      'movedToFor("/admin/check-ins/[groupId]")',
    ],
    ["leader-pipeline/page.tsx", 'movedToFor("/admin/leader-pipeline")'],
    ["group-health/page.tsx", 'movedToFor("/admin/group-health")'],
    ["calendar/page.tsx", 'movedToFor("/admin/calendar")'],
    ["launch-planning/page.tsx", 'movedToFor("/admin/launch-planning")'],
  ])("%s links its banner via %s", (relPath, expected) => {
    expect(read(relPath)).toContain(expected);
  });

  it.each([
    ["guests/layout.tsx", 'canonicalFor("/admin/guests")'],
    ["check-ins/layout.tsx", 'canonicalFor("/admin/check-ins")'],
  ])("%s redirects its flag-off gate via %s", (relPath, expected) => {
    expect(read(relPath)).toContain(expected);
  });

  it("the Planning host keeps no moved-to link (ADR 0033)", () => {
    const src = read("planning/page.tsx");
    expect(src).not.toContain("movedToFor");
    expect(src).not.toMatch(/\bredirect\s*\(/);
  });
});
