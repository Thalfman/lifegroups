import type { UserRole } from "@/types/enums";

export type { UserRole };

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  ministry_admin: "Ministry Admin",
  staff_viewer: "Staff Viewer",
  leader: "Leader",
  co_leader: "Co-Leader",
};

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(["super_admin", "ministry_admin"]);
const ADMIN_OR_STAFF_ROLES: ReadonlySet<UserRole> = new Set([
  "super_admin",
  "ministry_admin",
  "staff_viewer",
]);
const LEADER_ROLES: ReadonlySet<UserRole> = new Set(["leader", "co_leader"]);

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function isAdminOrStaffRole(role: UserRole): boolean {
  return ADMIN_OR_STAFF_ROLES.has(role);
}

export function isLeaderRole(role: UserRole): boolean {
  return LEADER_ROLES.has(role);
}

export function defaultLandingPathForRole(role: UserRole): string {
  if (isAdminRole(role)) return "/admin";
  // staff_viewer is retained in the DB enum for backwards compatibility but
  // no longer has a product surface; route any such accounts to /unauthorized.
  if (role === "staff_viewer") return "/unauthorized";
  if (isLeaderRole(role)) return "/leader";
  return "/unauthorized";
}

export function navItemsForRole(role: UserRole): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  if (isAdminRole(role)) {
    items.push({ href: "/admin", label: "Admin" });
    items.push({ href: "/admin/people", label: "Manage People" });
    items.push({ href: "/admin/groups", label: "Manage Groups" });
    items.push({ href: "/admin/check-ins", label: "Check-Ins" });
    // Phase 5A.3: only super_admin sees the owner console. ministry_admin
    // keeps every other admin item but has no need for the audit log or
    // role-management surfaces.
    if (role === "super_admin") {
      items.push({ href: "/admin/super-admin", label: "Super Admin" });
    }
  } else if (isLeaderRole(role)) {
    items.push({ href: "/leader", label: "My Groups" });
  }
  return items;
}
