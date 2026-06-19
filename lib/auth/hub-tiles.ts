import type { UserRole } from "@/types/enums";
import {
  ADMIN_AREAS,
  DEFAULT_HIDDEN_ADMIN_AREAS,
  isAdminRole,
  isOverShepherdRole,
} from "@/lib/auth/roles";

export interface HubTile {
  href: string;
  label: string;
  icon: string;
}

// The Home Hub launcher mirrors the Care/Plan/Multiply spine (ADR 0016): one
// tile per VISIBLE area, in the same order as the sidebar and bottom nav, so all
// three surfaces stay consistent. The shared source is ADMIN_AREAS in
// lib/auth/roles.ts; default-hidden tabs (Groups/People/Planning) drop out via
// the same hiddenAreas set the sidebar uses (resolveHiddenNav).
function adminTiles(hiddenAreas: ReadonlySet<string>): HubTile[] {
  return ADMIN_AREAS.filter((a) => !hiddenAreas.has(a.href)).map((a) => ({
    href: a.href,
    label: a.label,
    icon: a.icon,
  }));
}

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
  { href: "/over-shepherd", label: "My Shepherds", icon: "people" },
];

export function hubTilesForRole(
  role: UserRole,
  hiddenAreas: ReadonlySet<string> = DEFAULT_HIDDEN_ADMIN_AREAS
): HubTile[] {
  if (isAdminRole(role)) {
    return [
      ...adminTiles(hiddenAreas),
      ...(role === "super_admin" ? [SUPER_ADMIN_CONSOLE_TILE] : []),
    ];
  }
  if (isOverShepherdRole(role)) {
    return [...OVER_SHEPHERD_TILES];
  }
  return [];
}
