import { describe, expect, it } from "vitest";

import { listSourceFiles } from "@/tests/fitness/support/source-globber";
import {
  ADMIN_ROUTE_REGISTRY,
  activeRoutePaths,
  deriveAliasMap,
  routeEntry,
} from "@/lib/nav/route-registry";
import { NAV_ALIAS_TO_CANONICAL } from "@/lib/nav/active-nav";

// Governance for the admin route registry (issue #695). The registry is only a
// source of truth if it stays in lockstep with the real route tree, so these
// tests enumerate the actual `app/(protected)/admin/**` routes and assert a
// two-way correspondence: every resolvable route is registered, and every
// registry entry points at a route that exists.

// Convert a `page.tsx` / `route.ts` source path into the route it resolves.
//   app/(protected)/admin/groups/[groupId]/page.tsx -> /admin/groups/[groupId]
//   app/(protected)/admin/page.tsx                  -> /admin
function routeForSource(relPath: string): string {
  return relPath
    .replace(/^app\/\(protected\)/, "")
    .replace(/\/(page\.tsx|route\.ts)$/, "");
}

const ROUTE_FILES = listSourceFiles({
  roots: ["app/(protected)/admin"],
  extensions: ["/page.tsx", "/route.ts"],
}).filter((f) => /\/(page\.tsx|route\.ts)$/.test(f));

const FILESYSTEM_ROUTES = ROUTE_FILES.map(routeForSource).sort();
const REGISTRY_PATHS = ADMIN_ROUTE_REGISTRY.map((e) => e.path).sort();

describe("admin route registry — governance", () => {
  it("discovers the admin route tree (sanity)", () => {
    expect(FILESYSTEM_ROUTES).toContain("/admin");
    expect(FILESYSTEM_ROUTES.length).toBeGreaterThan(20);
  });

  it("every resolvable /admin/* route has a registry entry", () => {
    const missing = FILESYSTEM_ROUTES.filter((r) => !routeEntry(r));
    expect(
      missing,
      missing.length === 0
        ? ""
        : `These routes exist on disk but are unregistered in ` +
            `route-registry.ts:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("no registry entry is orphaned (points at a non-existent route)", () => {
    const fsSet = new Set(FILESYSTEM_ROUTES);
    const orphans = REGISTRY_PATHS.filter((p) => !fsSet.has(p));
    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These registry entries have no route file on disk:\n  ${orphans.join(
            "\n  "
          )}`
    ).toEqual([]);
  });

  it("registry paths are unique", () => {
    expect(REGISTRY_PATHS.length).toBe(new Set(REGISTRY_PATHS).size);
  });

  it("every alias/frozen canonical resolves to an active route", () => {
    const active = activeRoutePaths();
    const broken = ADMIN_ROUTE_REGISTRY.filter(
      (e) => e.canonical && !active.has(e.canonical)
    ).map((e) => `${e.path} -> ${e.canonical}`);
    expect(
      broken,
      broken.length === 0
        ? ""
        : `These entries point a canonical at a non-active route:\n  ${broken.join(
            "\n  "
          )}`
    ).toEqual([]);
  });

  it("alias roots carry a canonical target", () => {
    const bad = ADMIN_ROUTE_REGISTRY.filter(
      (e) => e.aliasRoot && !e.canonical
    ).map((e) => e.path);
    expect(bad).toEqual([]);
  });
});

describe("admin route registry — derives the nav alias map without behavior change", () => {
  // The alias map active-nav.ts exports must be EXACTLY the legacy literal, so
  // resolveCanonicalPath / isActiveNavHref behave identically. Pin both the
  // derived map and the public export against the known-good pairs.
  const EXPECTED_ALIAS_MAP: Record<string, string> = {
    "/admin/shepherd-care": "/admin/care",
    "/admin/follow-ups": "/admin/care",
    "/admin/leader-pipeline": "/admin/care",
    "/admin/group-health": "/admin/care",
    "/admin/check-ins": "/admin/care",
    "/admin/launch-planning": "/admin/multiply",
    "/admin/calendar": "/admin/multiply",
    "/admin/guests": "/admin/plan",
  };

  it("deriveAliasMap() equals the legacy alias map", () => {
    expect(deriveAliasMap()).toEqual(EXPECTED_ALIAS_MAP);
  });

  it("the public NAV_ALIAS_TO_CANONICAL export is the derived map", () => {
    expect({ ...NAV_ALIAS_TO_CANONICAL }).toEqual(EXPECTED_ALIAS_MAP);
  });
});
