import type { UserRole } from "@/types/enums";

export type { UserRole };

// staff_viewer is legacy/no-access only — kept in the enum for DB compatibility;
// never assigned from the UI and always routed to /unauthorized.
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  ministry_admin: "Ministry Admin",
  staff_viewer: "Legacy (no access)",
  leader: "Leader",
  co_leader: "Co-Leader",
};

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(["super_admin", "ministry_admin"]);
const LEADER_ROLES: ReadonlySet<UserRole> = new Set(["leader", "co_leader"]);

// Single source of truth for the full UserRole set. Used at trust
// boundaries (session profile read) to validate that an incoming role
// string is actually a known role.
export const USER_ROLES: ReadonlySet<UserRole> = new Set([
  "super_admin",
  "ministry_admin",
  "staff_viewer",
  "leader",
  "co_leader",
]);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.has(value as UserRole);
}

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function isLeaderRole(role: UserRole): boolean {
  return LEADER_ROLES.has(role);
}

export function defaultLandingPathForRole(role: UserRole): string {
  if (isAdminRole(role)) return "/admin";
  if (role === "staff_viewer") return "/unauthorized";
  if (isLeaderRole(role)) return "/leader";
  return "/unauthorized";
}

// Julian admin OS ordering: shepherd care + launch planning lead, then
// follow-ups (the leader-visible task queue), then operational
// management (people, groups, calendar, check-ins). Guests is intentionally
// omitted from nav per PRODUCT_ROADMAP.md EXT.1 — the route still resolves
// for existing bookmarks.
export function navItemsForRole(role: UserRole): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  if (isAdminRole(role)) {
    items.push({ href: "/admin", label: "Admin" });
    items.push({ href: "/admin/shepherd-care", label: "Shepherd care" });
    items.push({ href: "/admin/launch-planning", label: "Launch planning" });
    items.push({ href: "/admin/follow-ups", label: "Follow-ups" });
    items.push({ href: "/admin/people", label: "People" });
    items.push({ href: "/admin/groups", label: "Groups" });
    items.push({ href: "/admin/calendar", label: "Calendar" });
    items.push({ href: "/admin/check-ins", label: "Check-ins" });
    items.push({ href: "/admin/settings", label: "Settings" });
    if (role === "super_admin") {
      items.push({ href: "/admin/super-admin", label: "Super admin" });
    }
  } else if (isLeaderRole(role)) {
    items.push({ href: "/leader", label: "My Groups" });
  }
  return items;
}

export type AdminNavGroupKey = "top" | "manage" | "shepherd" | "system";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
}

export interface AdminNavGroup {
  group: AdminNavGroupKey;
  label: string;
  items: AdminNavItem[];
}

export function adminNavGroups(role: UserRole): AdminNavGroup[] {
  // Julian admin OS pivot (2026-05): the "shepherd" group now leads with
  // the admin-OS spine (shepherd care, launch planning, follow-ups) and
  // is labeled "Admin OS". The "manage" group holds operational surfaces
  // and ends with Check-ins (formerly second in the list, now demoted).
  // Guests is intentionally dropped from nav per PRODUCT_ROADMAP.md
  // EXT.1; the route still resolves so existing bookmarks work. See
  // docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the pivot rationale.
  const groups: AdminNavGroup[] = [
    {
      group: "top",
      label: "",
      items: [{ href: "/admin", label: "Admin", icon: "sun" }],
    },
    {
      group: "shepherd",
      label: "Admin OS",
      items: [
        { href: "/admin/shepherd-care", label: "Shepherd care", icon: "heart" },
        { href: "/admin/launch-planning", label: "Launch planning", icon: "compass" },
        { href: "/admin/follow-ups", label: "Follow-ups", icon: "flag" },
      ],
    },
    {
      group: "manage",
      label: "Manage",
      items: [
        { href: "/admin/people", label: "People", icon: "people" },
        { href: "/admin/groups", label: "Groups", icon: "groups" },
        { href: "/admin/calendar", label: "Calendar", icon: "cal" },
        { href: "/admin/check-ins", label: "Check-ins", icon: "check" },
      ],
    },
    {
      group: "system",
      label: "System",
      items: [
        { href: "/admin/settings", label: "Settings", icon: "cog" },
        ...(role === "super_admin"
          ? [{ href: "/admin/super-admin", label: "Super admin", icon: "star" }]
          : []),
      ],
    },
  ];
  return groups;
}
