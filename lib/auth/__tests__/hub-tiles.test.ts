import { describe, expect, it } from "vitest";
import { hubTilesForRole } from "@/lib/auth/hub-tiles";
import type { UserRole } from "@/types/enums";

describe("hubTilesForRole", () => {
  it("gives ministry_admin the full admin-OS tile set in order, with the corrected Leader care label over the unchanged shepherd-care route", () => {
    const tiles = hubTilesForRole("ministry_admin");
    expect(tiles.map((t) => [t.label, t.href])).toEqual([
      ["Leader care", "/admin/shepherd-care"],
      ["Launch planning", "/admin/launch-planning"],
      // Group health folded into Groups (#300): no separate tile.
      ["Follow-ups", "/admin/follow-ups"],
      ["People", "/admin/people"],
      ["Groups", "/admin/groups"],
      ["Calendar", "/admin/calendar"],
    ]);
  });

  it("gives super_admin the admin-OS set plus a Super Admin Console tile last", () => {
    const tiles = hubTilesForRole("super_admin");
    expect(tiles.map((t) => [t.label, t.href])).toEqual([
      ["Leader care", "/admin/shepherd-care"],
      ["Launch planning", "/admin/launch-planning"],
      // Group health folded into Groups (#300): no separate tile.
      ["Follow-ups", "/admin/follow-ups"],
      ["People", "/admin/people"],
      ["Groups", "/admin/groups"],
      ["Calendar", "/admin/calendar"],
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
      ["My Leaders", "/over-shepherd"],
    ]);
  });

  // leader / co_leader are no-access (ADR 0002): they never reach
  // the hub (page routes them to /unauthorized), so they must surface no tiles.
  it.each<UserRole>(["leader", "co_leader"])(
    "gives no tiles to the no-access role %s",
    (role) => {
      expect(hubTilesForRole(role)).toEqual([]);
    }
  );
});
