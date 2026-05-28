import { describe, expect, it } from "vitest";
import {
  adminNavGroups,
  defaultLandingPathForRole,
  isAdminRole,
  isLeaderRole,
  navItemsForRole,
} from "@/lib/auth/roles";
import type { UserRole } from "@/types/enums";

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "ministry_admin",
  "staff_viewer",
  "leader",
  "co_leader",
];

describe("isAdminRole", () => {
  it("returns true for super_admin and ministry_admin only", () => {
    const admins: UserRole[] = ["super_admin", "ministry_admin"];
    for (const role of ALL_ROLES) {
      expect(isAdminRole(role)).toBe(admins.includes(role));
    }
  });
});

describe("isLeaderRole", () => {
  it("returns true for leader and co_leader only", () => {
    const leaders: UserRole[] = ["leader", "co_leader"];
    for (const role of ALL_ROLES) {
      expect(isLeaderRole(role)).toBe(leaders.includes(role));
    }
  });
});

describe("defaultLandingPathForRole", () => {
  it("routes admins to /admin", () => {
    expect(defaultLandingPathForRole("super_admin")).toBe("/admin");
    expect(defaultLandingPathForRole("ministry_admin")).toBe("/admin");
  });

  it("routes leaders to /leader", () => {
    expect(defaultLandingPathForRole("leader")).toBe("/leader");
    expect(defaultLandingPathForRole("co_leader")).toBe("/leader");
  });

  it("routes staff_viewer to /unauthorized", () => {
    expect(defaultLandingPathForRole("staff_viewer")).toBe("/unauthorized");
  });
});

describe("navItemsForRole", () => {
  it("includes the super-admin link only for super_admin", () => {
    const superHrefs = navItemsForRole("super_admin").map((i) => i.href);
    const ministryHrefs = navItemsForRole("ministry_admin").map((i) => i.href);
    expect(superHrefs).toContain("/admin/super-admin");
    expect(ministryHrefs).not.toContain("/admin/super-admin");
  });

  it("gives leaders only the home + my-groups items", () => {
    const leaderHrefs = navItemsForRole("leader").map((i) => i.href);
    expect(leaderHrefs).toEqual(["/", "/leader"]);
    const coLeaderHrefs = navItemsForRole("co_leader").map((i) => i.href);
    expect(coLeaderHrefs).toEqual(["/", "/leader"]);
  });

  it("gives staff_viewer only the home item", () => {
    expect(navItemsForRole("staff_viewer").map((i) => i.href)).toEqual(["/"]);
  });
});

describe("adminNavGroups", () => {
  it("includes the super-admin item in the system group for super_admin", () => {
    const groups = adminNavGroups("super_admin");
    const system = groups.find((g) => g.group === "system");
    expect(system).toBeDefined();
    expect(system!.items.map((i) => i.href)).toContain("/admin/super-admin");
  });

  it("omits the super-admin item for ministry_admin", () => {
    const groups = adminNavGroups("ministry_admin");
    const system = groups.find((g) => g.group === "system");
    expect(system).toBeDefined();
    expect(system!.items.map((i) => i.href)).not.toContain("/admin/super-admin");
  });

  // Julian admin OS pivot (2026-05): the "shepherd" group leads
  // operational manage now, and is labeled "Admin OS" in the UI. See
  // docs/PRODUCT_SURFACE_AUDIT_2026-05.md.
  it("returns the same four group keys regardless of role", () => {
    const expected = ["top", "shepherd", "manage", "system"];
    for (const role of ALL_ROLES) {
      expect(adminNavGroups(role).map((g) => g.group)).toEqual(expected);
    }
  });

  it("leads the shepherd group with shepherd care + launch planning", () => {
    const groups = adminNavGroups("ministry_admin");
    const shepherd = groups.find((g) => g.group === "shepherd");
    expect(shepherd).toBeDefined();
    expect(shepherd!.label).toBe("Admin OS");
    expect(shepherd!.items.map((i) => i.href)).toEqual([
      "/admin/shepherd-care",
      "/admin/launch-planning",
      "/admin/follow-ups",
    ]);
  });

  it("drops /admin/guests from nav for both admin roles", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const allHrefs = adminNavGroups(role).flatMap((g) =>
        g.items.map((i) => i.href),
      );
      expect(allHrefs).not.toContain("/admin/guests");
    }
  });
});
