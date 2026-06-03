import type { UserRole } from "@/types/enums";
import { ADMIN_AREAS, isAdminRole, isOverShepherdRole } from "@/lib/auth/roles";

export interface HubTile {
  href: string;
  label: string;
  icon: string;
}

// The Home Hub launcher mirrors the six-area spine (ADR 0013): one tile per
// area, in the same order as the sidebar and bottom nav, so all three surfaces
// stay consistent. The shared source is ADMIN_AREAS in lib/auth/roles.ts.
const ADMIN_TILES: readonly HubTile[] = ADMIN_AREAS.map((a) => ({ ...a }));

// Super Admin alone sees the console tile, matching the super-admin nav gate in
// navItemsForRole / adminNavGroups.
const SUPER_ADMIN_CONSOLE_TILE: HubTile = {
  href: "/admin/super-admin",
  label: "Super Admin Console",
  icon: "star",
};

// Over-Shepherd lands on a focused hub centered on My Shepherds, matching the
// single-entry nav in navItemsForRole rather than the admin-OS spine.
const OVER_SHEPHERD_TILES: readonly HubTile[] = [
  { href: "/over-shepherd", label: "My Leaders", icon: "people" },
];

export function hubTilesForRole(role: UserRole): HubTile[] {
  if (isAdminRole(role)) {
    return [
      ...ADMIN_TILES,
      ...(role === "super_admin" ? [SUPER_ADMIN_CONSOLE_TILE] : []),
    ];
  }
  if (isOverShepherdRole(role)) {
    return [...OVER_SHEPHERD_TILES];
  }
  return [];
}
