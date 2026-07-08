import type { UserRole } from "@/types/enums";
import {
  ADMIN_AREAS,
  DEFAULT_HIDDEN_ADMIN_AREAS,
  isAdminRole,
  isLeaderRole,
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

// Shepherd (leader / co_leader) hub: a single Care tile pointing at /leader,
// matching the leader entries in navItemsForRole and navGroupsForRole (ADR
// 0017/0024 — the Leader surface is live by default). Without a tile the Home
// page dead-ends a signed-in leader at /unauthorized whenever the landing-hint
// cookie is absent (and /unauthorized clears that cookie, so the "Back to
// home" link loops). The requireLeader guard on /leader still holds the
// verify-before-flip gate; the tile opens nothing by itself.
const LEADER_TILES: readonly HubTile[] = [
  { href: "/leader", label: "Care", icon: "heart" },
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
  if (isLeaderRole(role)) {
    return [...LEADER_TILES];
  }
  return [];
}
