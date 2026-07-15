import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ROUTE_REGISTRY,
  CANONICAL_AREA_LABELS,
  canonicalFor,
  movedToFor,
} from "@/lib/nav/route-registry";

// "This moved" affordances for the frozen pre-pivot surfaces (#901). The
// mapping lives in ONE place — movedToFor / canonicalFor over the registry —
// consumed two ways:
//
//   * flag-off gates: guests redirects to canonicalFor("/admin/guests") (the
//     Plan Interest Funnel genuinely absorbed that workflow); check-ins keep
//     the frozen NOTICE instead, because per ADR 0033 no canonical surface
//     covers the weekly review — there is nowhere truthful to redirect.
//   * banner links: pages call movedToFor(<own route>); routes whose registry
//     canonical is only the nav active-owner get a per-route override —
//     leader-pipeline points at Multiply's Shepherds tab, and
//     calendar / launch-planning / check-ins suppress the link (null) because
//     their panels still live only in PlanningView / behind the check-ins gate.
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

  it("overrides the leader pipeline's moved-to target to its workflow home", () => {
    // The registry canonical (/admin/care) is only the nav active-owner; the
    // pipeline itself was re-homed to Multiply's Shepherds tab (ADR 0022) —
    // the moved-to link must land where the work actually lives, and no
    // retired vocabulary may leak into the override label either.
    const movedTo = movedToFor("/admin/leader-pipeline");
    expect(movedTo).toEqual({
      href: "/admin/multiply?tab=leaders",
      label: "Multiply — the Shepherds tab",
    });
    expect(canonicalFor("/admin/leader-pipeline")).toBe("/admin/care");
    expect(movedTo?.label).not.toMatch(/guest|check-?in/i);
  });

  it("suppresses the link where no live replacement exists (ADR 0033)", () => {
    // The calendar/launch panels still live only in PlanningView, and no
    // canonical surface covers weekly check-ins — a "current home" link for
    // these would land old bookmarks on a page without the work. The nav
    // canonical stays untouched (active-nav highlighting is separate).
    expect(movedToFor("/admin/calendar")).toBeNull();
    expect(movedToFor("/admin/launch-planning")).toBeNull();
    expect(movedToFor("/admin/check-ins")).toBeNull();
    expect(movedToFor("/admin/check-ins/[groupId]")).toBeNull();
    expect(canonicalFor("/admin/calendar")).toBe("/admin/multiply");
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

  it("guests' flag-off gate redirects via its registry canonical", () => {
    expect(read("guests/layout.tsx")).toContain(
      'canonicalFor("/admin/guests")'
    );
  });

  it("check-ins' flag-off gate keeps the notice — no redirect (ADR 0033)", () => {
    const src = read("check-ins/layout.tsx");
    expect(src).toContain("notice");
    expect(src).not.toContain("redirectTo");
  });

  it("the Planning host keeps no moved-to link (ADR 0033)", () => {
    const src = read("planning/page.tsx");
    expect(src).not.toContain("movedToFor");
    expect(src).not.toMatch(/\bredirect\s*\(/);
  });
});
