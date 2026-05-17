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
  if (role === "staff_viewer") return "/staff";
  if (isLeaderRole(role)) return "/leader";
  return "/unauthorized";
}

export function navItemsForRole(role: UserRole): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  if (isAdminRole(role)) {
    items.push({ href: "/admin", label: "Admin" });
    items.push({ href: "/staff", label: "Staff View" });
  } else if (role === "staff_viewer") {
    items.push({ href: "/staff", label: "Staff View" });
  } else if (isLeaderRole(role)) {
    items.push({ href: "/leader", label: "My Groups" });
  }
  return items;
}
