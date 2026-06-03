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

// Six-area spine (ADR 0013): Home / Groups / Care / People / Planning /
// Settings, as a flat list on every nav surface. Super Admin is appended only
// for super_admin and is not one of the six (ADR 0002).
const SIX_AREAS = [
  "/admin",
  "/admin/groups",
  "/admin/care",
  "/admin/people",
  "/admin/planning",
  "/admin/settings",
];

describe("navItemsForRole", () => {
  it("gives admin roles the six areas as a flat list (Home → /admin)", () => {
    const items = navItemsForRole("ministry_admin");
    expect(items.map((i) => i.href)).toEqual(SIX_AREAS);
    expect(items.map((i) => i.label)).toEqual([
      "Home",
      "Groups",
      "Care",
      "People",
      "Planning",
      "Settings",
    ]);
  });

  it("appends the super-admin entry only for super_admin", () => {
    const superItems = navItemsForRole("super_admin");
    expect(superItems.map((i) => i.href)).toEqual([
      ...SIX_AREAS,
      "/admin/super-admin",
    ]);
    expect(navItemsForRole("ministry_admin").map((i) => i.href)).not.toContain(
      "/admin/super-admin"
    );
  });

  it("points Care and Planning at the new landing shells", () => {
    const hrefs = navItemsForRole("ministry_admin").map((i) => i.href);
    expect(hrefs).toContain("/admin/care");
    expect(hrefs).toContain("/admin/planning");
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

  it("gives over_shepherd the home + my-shepherds items only", () => {
    const hrefs = navItemsForRole("over_shepherd").map((i) => i.href);
    expect(hrefs).toEqual(["/", "/over-shepherd"]);
    // Over-Shepherd gets none of the admin nav surface.
    expect(hrefs).not.toContain("/admin");
  });
});

describe("adminNavGroups", () => {
  it("renders the six areas as a single flat group with no section header", () => {
    const groups = adminNavGroups("ministry_admin");
    // Flat list: one group, empty label so the Sidebar renders no header.
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("");
    expect(groups[0]!.items.map((i) => i.href)).toEqual(SIX_AREAS);
    expect(groups[0]!.items.map((i) => i.label)).toEqual([
      "Home",
      "Groups",
      "Care",
      "People",
      "Planning",
      "Settings",
    ]);
  });

  it("appends the super-admin item only for super_admin", () => {
    const superHrefs = adminNavGroups("super_admin")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(superHrefs).toEqual([...SIX_AREAS, "/admin/super-admin"]);
    const ministryHrefs = adminNavGroups("ministry_admin")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(ministryHrefs).not.toContain("/admin/super-admin");
  });

  it("points Care and Planning at the new landing shells", () => {
    const items = adminNavGroups("ministry_admin").flatMap((g) => g.items);
    expect(items.find((i) => i.label === "Care")!.href).toBe("/admin/care");
    expect(items.find((i) => i.label === "Planning")!.href).toBe(
      "/admin/planning"
    );
  });

  // Frozen routes stay reachable by direct URL (ADR 0008/0009): the six-area
  // spine drops them from the top-level nav but never renames them. They are
  // intentionally absent from the flat nav now (hosted under areas in later
  // slices), so assert they are not surfaced as their own top-level entries.
  it("no longer surfaces the consolidated routes as their own nav entries", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const hrefs = adminNavGroups(role)
        .flatMap((g) => g.items)
        .map((i) => i.href);
      for (const gone of [
        "/admin/shepherd-care",
        "/admin/follow-ups",
        "/admin/launch-planning",
        "/admin/calendar",
        "/admin/group-health",
        "/admin/leader-pipeline",
        "/admin/check-ins",
        "/admin/guests",
      ]) {
        expect(hrefs).not.toContain(gone);
      }
    }
  });
});
