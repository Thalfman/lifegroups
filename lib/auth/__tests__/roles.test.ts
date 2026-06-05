import { describe, expect, it } from "vitest";
import {
  ADMIN_AREAS,
  DEFAULT_HIDDEN_ADMIN_AREAS,
  adminNavGroups,
  defaultLandingPathForRole,
  isAdminRole,
  isLeaderRole,
  isOverShepherdRole,
  navItemsForRole,
} from "@/lib/auth/roles";
import {
  NAV_VISIBILITY_FLAGS,
  DEFAULT_HIDDEN_NAV_AREAS,
} from "@/lib/admin/feature-flags";
import type { UserRole } from "@/types/enums";

// Re-show every default-hidden tab, so a test can assert the full area set still
// resolves through the nav builders when a Super Admin has flipped the flags on.
const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

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

// Care/Plan/Multiply pivot (ADR 0016, superseding ADR 0013): the default-visible
// spine is Home · Care · Plan · Multiply · Settings, as a flat list on every nav
// surface. Groups, People, Planning are hidden by default (Super-Admin
// nav-visibility flags). Super Admin is appended only for super_admin (ADR 0002).
const VISIBLE_AREAS = [
  "/admin",
  "/admin/care",
  "/admin/plan",
  "/admin/multiply",
  "/admin/settings",
];

// The full area set, in render order, once every hidden tab is re-shown — the
// hidden three slot in before Settings.
const ALL_AREAS = [
  "/admin",
  "/admin/care",
  "/admin/plan",
  "/admin/multiply",
  "/admin/groups",
  "/admin/people",
  "/admin/planning",
  "/admin/settings",
];

describe("ADMIN_AREAS / nav-visibility wiring", () => {
  it("hides exactly Groups, People, Planning by default", () => {
    expect([...DEFAULT_HIDDEN_ADMIN_AREAS].sort()).toEqual(
      ["/admin/groups", "/admin/people", "/admin/planning"].sort()
    );
  });

  it("marks every default-hidden area with a nav-visibility flag key, and no others", () => {
    for (const area of ADMIN_AREAS) {
      const hidden = DEFAULT_HIDDEN_ADMIN_AREAS.has(area.href);
      expect(
        Boolean(area.navFlagKey),
        `${area.href} flag-key vs hidden mismatch`
      ).toBe(hidden);
    }
  });

  it("keeps each area's navFlagKey in lock-step with the feature-flag registry (no drift)", () => {
    // The (flagKey → areaHref) the resolver uses must match the (areaHref →
    // flagKey) the nav carries, or a Super Admin could toggle a flag that moves
    // no tab — or a tab could hide with no toggle to bring it back.
    const fromAreas = ADMIN_AREAS.filter((a) => a.navFlagKey)
      .map((a) => `${a.navFlagKey}:${a.href}`)
      .sort();
    const fromFlags = NAV_VISIBILITY_FLAGS.map(
      (f) => `${f.key}:${f.areaHref}`
    ).sort();
    expect(fromAreas).toEqual(fromFlags);
    // ...and the two modules agree on the default-hidden baseline.
    expect([...DEFAULT_HIDDEN_ADMIN_AREAS].sort()).toEqual(
      [...DEFAULT_HIDDEN_NAV_AREAS].sort()
    );
  });
});

describe("navItemsForRole", () => {
  it("gives admin roles the visible spine by default (Home → /admin)", () => {
    const items = navItemsForRole("ministry_admin");
    expect(items.map((i) => i.href)).toEqual(VISIBLE_AREAS);
    expect(items.map((i) => i.label)).toEqual([
      "Home",
      "Care",
      "Plan",
      "Multiply",
      "Settings",
    ]);
  });

  it("re-shows hidden tabs when their flag is on (empty hidden set)", () => {
    const items = navItemsForRole("ministry_admin", NOTHING_HIDDEN);
    expect(items.map((i) => i.href)).toEqual(ALL_AREAS);
  });

  it("appends the super-admin entry only for super_admin", () => {
    const superItems = navItemsForRole("super_admin");
    expect(superItems.map((i) => i.href)).toEqual([
      ...VISIBLE_AREAS,
      "/admin/super-admin",
    ]);
    expect(navItemsForRole("ministry_admin").map((i) => i.href)).not.toContain(
      "/admin/super-admin"
    );
  });

  it("points Care, Plan, and Multiply at their landing shells", () => {
    const hrefs = navItemsForRole("ministry_admin").map((i) => i.href);
    expect(hrefs).toContain("/admin/care");
    expect(hrefs).toContain("/admin/plan");
    expect(hrefs).toContain("/admin/multiply");
  });

  it("hides Groups, People, and Planning from the default nav", () => {
    const hrefs = navItemsForRole("ministry_admin").map((i) => i.href);
    for (const hidden of [
      "/admin/groups",
      "/admin/people",
      "/admin/planning",
    ]) {
      expect(hrefs).not.toContain(hidden);
    }
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
  it("renders the visible spine as a single flat group with no section header", () => {
    const groups = adminNavGroups("ministry_admin");
    // Flat list: one group, empty label so the Sidebar renders no header.
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("");
    expect(groups[0]!.items.map((i) => i.href)).toEqual(VISIBLE_AREAS);
    expect(groups[0]!.items.map((i) => i.label)).toEqual([
      "Home",
      "Care",
      "Plan",
      "Multiply",
      "Settings",
    ]);
  });

  it("re-shows hidden tabs when their flag is on (empty hidden set)", () => {
    const hrefs = adminNavGroups("ministry_admin", NOTHING_HIDDEN)
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(hrefs).toEqual(ALL_AREAS);
  });

  it("appends the super-admin item only for super_admin", () => {
    const superHrefs = adminNavGroups("super_admin")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(superHrefs).toEqual([...VISIBLE_AREAS, "/admin/super-admin"]);
    const ministryHrefs = adminNavGroups("ministry_admin")
      .flatMap((g) => g.items)
      .map((i) => i.href);
    expect(ministryHrefs).not.toContain("/admin/super-admin");
  });

  it("points Care, Plan, and Multiply at their landing shells", () => {
    const items = adminNavGroups("ministry_admin").flatMap((g) => g.items);
    expect(items.find((i) => i.label === "Care")!.href).toBe("/admin/care");
    expect(items.find((i) => i.label === "Plan")!.href).toBe("/admin/plan");
    expect(items.find((i) => i.label === "Multiply")!.href).toBe(
      "/admin/multiply"
    );
  });

  // The pivot hides Groups/People/Planning by default and never surfaces the
  // frozen consolidated routes as their own top-level entries; all of them stay
  // reachable by direct URL (ADR 0008/0009/0016).
  it("does not surface the hidden tabs or the consolidated routes as nav entries", () => {
    for (const role of ["super_admin", "ministry_admin"] as const) {
      const hrefs = adminNavGroups(role)
        .flatMap((g) => g.items)
        .map((i) => i.href);
      for (const gone of [
        "/admin/groups",
        "/admin/people",
        "/admin/planning",
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
