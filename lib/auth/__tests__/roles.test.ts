import { describe, expect, it } from "vitest";
import {
  adminNavGroups,
  defaultLandingPathForRole,
  isAdminRole,
  isLeaderRole,
  isOverShepherdRole,
  navItemsForRole,
} from "@/lib/auth/roles";
import type { UserRole } from "@/types/enums";

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "ministry_admin",
  "over_shepherd",
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

describe("isOverShepherdRole", () => {
  it("returns true for over_shepherd only", () => {
    for (const role of ALL_ROLES) {
      expect(isOverShepherdRole(role)).toBe(role === "over_shepherd");
    }
  });

  it("keeps over_shepherd out of the admin and leader categories", () => {
    expect(isAdminRole("over_shepherd")).toBe(false);
    expect(isLeaderRole("over_shepherd")).toBe(false);
  });
});

describe("defaultLandingPathForRole", () => {
  it("routes admins to /admin", () => {
    expect(defaultLandingPathForRole("super_admin")).toBe("/admin");
    expect(defaultLandingPathForRole("ministry_admin")).toBe("/admin");
  });

  // Shepherd surface gated per docs/adr/0002-oversight-ladder-and-leader-gating.md:
  // leader / co_leader are treated as no-access.
  it("routes leaders to /unauthorized (leader surface gated)", () => {
    expect(defaultLandingPathForRole("leader")).toBe("/unauthorized");
    expect(defaultLandingPathForRole("co_leader")).toBe("/unauthorized");
  });

  it("routes over_shepherd to /over-shepherd", () => {
    expect(defaultLandingPathForRole("over_shepherd")).toBe("/over-shepherd");
  });
});

describe("navItemsForRole", () => {
  it("includes the super-admin link only for super_admin", () => {
    const superHrefs = navItemsForRole("super_admin").map((i) => i.href);
    const ministryHrefs = navItemsForRole("ministry_admin").map((i) => i.href);
    expect(superHrefs).toContain("/admin/super-admin");
    expect(ministryHrefs).not.toContain("/admin/super-admin");
  });

  // Shepherd surface gated per docs/adr/0002-oversight-ladder-and-leader-gating.md:
  // no leader nav entry is emitted any more; leaders see only the Home shell.
  it("gives leaders only the home item (leader nav entry dropped)", () => {
    const leaderHrefs = navItemsForRole("leader").map((i) => i.href);
    expect(leaderHrefs).toEqual(["/"]);
    const coLeaderHrefs = navItemsForRole("co_leader").map((i) => i.href);
    expect(coLeaderHrefs).toEqual(["/"]);
  });

  it("emits no /leader nav entry for any role", () => {
    for (const role of ALL_ROLES) {
      expect(navItemsForRole(role).map((i) => i.href)).not.toContain("/leader");
    }
  });

  // Dead Shepherd→admin reporting loop removed per
  // docs/adr/0002-oversight-ladder-and-leader-gating.md.
  it("drops /admin/check-ins from the flat nav for admin roles", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      expect(navItemsForRole(role).map((i) => i.href)).not.toContain(
        "/admin/check-ins"
      );
    }
  });

  it("gives over_shepherd the home + my-shepherds items only", () => {
    const hrefs = navItemsForRole("over_shepherd").map((i) => i.href);
    expect(hrefs).toEqual(["/", "/over-shepherd"]);
    // Over-Shepherd gets none of the admin nav surface.
    expect(hrefs).not.toContain("/admin");
  });

  // Capacity board and Multiplication were folded into Launch planning
  // (ADR 0010 surface-budget consolidation); they no longer appear in the nav.
  it("no longer surfaces /admin/capacity-board or /admin/multiplication", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const hrefs = navItemsForRole(role).map((i) => i.href);
      expect(hrefs).not.toContain("/admin/capacity-board");
      expect(hrefs).not.toContain("/admin/multiplication");
      expect(hrefs).toContain("/admin/launch-planning");
    }
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
    expect(system!.items.map((i) => i.href)).not.toContain(
      "/admin/super-admin"
    );
  });

  // #300: Group health was folded into Groups — Groups is now the single source
  // of truth for group setup, health, capacity, and lifecycle. There is no
  // separate Group Health nav entry; the /admin/group-health route survives
  // (ADR 0008/0009) and is reached from inside Groups.
  it("exposes no separate Group-Health nav entry for either admin role", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const item = adminNavGroups(role)
        .flatMap((g) => g.items)
        .find((i) => i.href === "/admin/group-health");
      expect(item).toBeUndefined();
    }
  });

  // Julian admin OS pivot (2026-05): the "shepherd" group leads
  // operational manage now, and is labeled "Ministry Admin" in the UI
  // ("Admin OS" remains the internal name). See
  // docs/PRODUCT_SURFACE_AUDIT_2026-05.md.
  it("returns the same four group keys regardless of role", () => {
    const expected = ["top", "shepherd", "manage", "system"];
    for (const role of ALL_ROLES) {
      expect(adminNavGroups(role).map((g) => g.group)).toEqual(expected);
    }
  });

  it("leads the shepherd group with leader care + launch planning, then leader pipeline", () => {
    const groups = adminNavGroups("ministry_admin");
    const shepherd = groups.find((g) => g.group === "shepherd");
    expect(shepherd).toBeDefined();
    expect(shepherd!.label).toBe("Ministry Admin");
    // Capacity board and Multiplication folded into Launch planning (ADR 0010).
    expect(shepherd!.items.map((i) => i.href)).toEqual([
      "/admin/shepherd-care",
      "/admin/launch-planning",
      "/admin/leader-pipeline",
      "/admin/follow-ups",
      // Group health folded into Groups (#300): no separate spine entry.
    ]);
  });

  it("drops /admin/guests from nav for both admin roles", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const allHrefs = adminNavGroups(role).flatMap((g) =>
        g.items.map((i) => i.href)
      );
      expect(allHrefs).not.toContain("/admin/guests");
    }
  });

  // Dead Shepherd→admin reporting loop removed per
  // docs/adr/0002-oversight-ladder-and-leader-gating.md.
  it("drops /admin/check-ins from the grouped nav for both admin roles", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const allHrefs = adminNavGroups(role).flatMap((g) =>
        g.items.map((i) => i.href)
      );
      expect(allHrefs).not.toContain("/admin/check-ins");
    }
    // the manage group keeps people / groups / calendar only
    const manage = adminNavGroups("ministry_admin").find(
      (g) => g.group === "manage"
    );
    expect(manage!.items.map((i) => i.href)).toEqual([
      "/admin/people",
      "/admin/groups",
      "/admin/calendar",
    ]);
  });
});
