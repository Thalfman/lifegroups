import { describe, expect, it } from "vitest";
import { hubTilesForRole } from "@/lib/auth/hub-tiles";
import type { UserRole } from "@/types/enums";

describe("hubTilesForRole", () => {
  // Care/Plan/Multiply pivot (ADR 0016): the Home Hub launcher mirrors the
  // default-visible spine in the same order as the sidebar and bottom nav.
  // Groups/People/Planning are hidden by default.
  it("gives ministry_admin one tile per visible area in spine order", () => {
    const tiles = hubTilesForRole("ministry_admin");
    expect(tiles.map((t) => [t.label, t.href])).toEqual([
      ["Home", "/admin"],
      ["Care", "/admin/care"],
      ["Plan", "/admin/plan"],
      ["Multiply", "/admin/multiply"],
      ["Settings", "/admin/settings"],
    ]);
  });

  it("re-shows hidden tabs as tiles when their flag is on (empty hidden set)", () => {
    const tiles = hubTilesForRole("ministry_admin", new Set());
    expect(tiles.map((t) => t.href)).toEqual([
      "/admin",
      "/admin/care",
      "/admin/plan",
      "/admin/multiply",
      "/admin/groups",
      "/admin/people",
      "/admin/planning",
      "/admin/settings",
    ]);
  });

  it("gives super_admin the visible area tiles plus a Super Admin Console tile last", () => {
    const tiles = hubTilesForRole("super_admin");
    expect(tiles.map((t) => [t.label, t.href])).toEqual([
      ["Home", "/admin"],
      ["Care", "/admin/care"],
      ["Plan", "/admin/plan"],
      ["Multiply", "/admin/multiply"],
      ["Settings", "/admin/settings"],
      ["Super Admin Console", "/admin/super-admin"],
    ]);
  });

  it("withholds the Super Admin Console tile from ministry_admin", () => {
    const hrefs = hubTilesForRole("ministry_admin").map((t) => t.href);
    expect(hrefs).not.toContain("/admin/super-admin");
  });

  it("gives over_shepherd a focused My Leaders tile, not the admin-OS set", () => {
    const tiles = hubTilesForRole("over_shepherd");
    expect(tiles.map((t) => [t.label, t.href])).toEqual([
      ["My Shepherds", "/over-shepherd"],
    ]);
  });

  // The Leader surface is live by default (ADR 0017/0024), so leader /
  // co_leader get a focused Care tile pointing at /leader — matching their
  // navItemsForRole / navGroupsForRole entries. Without it the Home page
  // dead-ends a signed-in shepherd at /unauthorized whenever the landing-hint
  // cookie is absent. The requireLeader guard still holds the
  // verify-before-flip gate on the route itself.
  it.each<UserRole>(["leader", "co_leader"])(
    "gives the shepherd role %s a focused Care tile",
    (role) => {
      expect(hubTilesForRole(role).map((t) => [t.label, t.href])).toEqual([
        ["Care", "/leader"],
      ]);
    }
  );
});
