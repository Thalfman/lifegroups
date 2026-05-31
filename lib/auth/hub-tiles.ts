import type { UserRole } from "@/types/enums";
import { isAdminRole, isOverShepherdRole } from "@/lib/auth/roles";

export interface HubTile {
  href: string;
  label: string;
  icon: string;
}

// The admin-OS tile set, mirroring the Admin OS + Manage nav spine in
// adminNavGroups but surfaced as a flat, ordered launcher. Note "Leader care"
// over the unchanged /admin/shepherd-care route — the ADR-0008 label/glossary
// rename sits on top of the deliberately-frozen shepherd_care_* schema.
const ADMIN_TILES: readonly HubTile[] = [
  { href: "/admin/shepherd-care", label: "Leader care", icon: "heart" },
  { href: "/admin/launch-planning", label: "Launch planning", icon: "compass" },
  { href: "/admin/multiplication", label: "Multiplication", icon: "sprout" },
  { href: "/admin/group-health", label: "Group health", icon: "sprout" },
  { href: "/admin/follow-ups", label: "Follow-ups", icon: "flag" },
  { href: "/admin/people", label: "People", icon: "people" },
  { href: "/admin/groups", label: "Groups", icon: "groups" },
  { href: "/admin/calendar", label: "Calendar", icon: "cal" },
];

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
