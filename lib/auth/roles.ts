import type { UserRole } from "@/types/enums";

export type { UserRole };

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  ministry_admin: "Ministry Admin",
  over_shepherd: "Over-Shepherd",
  leader: "Leader",
  co_leader: "Co-Leader",
};

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set([
  "super_admin",
  "ministry_admin",
]);
const LEADER_ROLES: ReadonlySet<UserRole> = new Set(["leader", "co_leader"]);
// Over-Shepherd is its own role category per
// docs/adr/0002-oversight-ladder-and-leader-gating.md — deliberately NOT a
// member of ADMIN_ROLES or LEADER_ROLES. It earns access only through
// predicates that name it explicitly (this set + later coverage-scoped RLS).
const OVER_SHEPHERD_ROLES: ReadonlySet<UserRole> = new Set(["over_shepherd"]);

// Single source of truth for the full UserRole set. Used at trust
// boundaries (session profile read) to validate that an incoming role
// string is actually a known role.
export const USER_ROLES: ReadonlySet<UserRole> = new Set([
  "super_admin",
  "ministry_admin",
  "over_shepherd",
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

export function isOverShepherdRole(role: UserRole): boolean {
  return OVER_SHEPHERD_ROLES.has(role);
}

export function defaultLandingPathForRole(role: UserRole): string {
  if (isAdminRole(role)) return "/admin";
  // Over-Shepherd lands on its own focused care surface, distinct from /admin.
  if (isOverShepherdRole(role)) return "/over-shepherd";
  // Shepherd (leader) surface gated per docs/adr/0002-oversight-ladder-and-leader-gating.md:
  // leader / co_leader are treated as no-access. They fall through to
  // /unauthorized rather than landing on /leader.
  return "/unauthorized";
}

// Julian admin OS ordering: shepherd care + launch planning lead, then
// follow-ups (the leader-visible task queue), then operational
// management (people, groups, calendar). Guests is intentionally
// omitted from nav per PRODUCT_ROADMAP.md EXT.1, and Check-ins is omitted
// per docs/adr/0002-oversight-ladder-and-leader-gating.md — both routes
// still resolve for existing bookmarks / direct URLs under the admin guard.
export function navItemsForRole(
  role: UserRole
): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
  ];
  if (isAdminRole(role)) {
    items.push({ href: "/admin", label: "Admin" });
    items.push({ href: "/admin/shepherd-care", label: "Leader care" });
    // Launch planning now also carries the former Capacity board and
    // Multiplication surfaces (ADR 0010 surface-budget consolidation); both old
    // routes redirect here. Leader pipeline stays its own destination.
    items.push({ href: "/admin/launch-planning", label: "Launch planning" });
    items.push({ href: "/admin/leader-pipeline", label: "Leader pipeline" });
    items.push({ href: "/admin/follow-ups", label: "Follow-ups" });
    items.push({ href: "/admin/people", label: "People" });
    items.push({ href: "/admin/groups", label: "Groups" });
    items.push({ href: "/admin/calendar", label: "Calendar" });
    // Check-ins dropped from nav per
    // docs/adr/0002-oversight-ladder-and-leader-gating.md (dead Shepherd→admin
    // reporting loop). The /admin/check-ins route stays dormant and reachable
    // by direct URL under the admin guard.
    items.push({ href: "/admin/settings", label: "Settings" });
    if (role === "super_admin") {
      items.push({ href: "/admin/super-admin", label: "Super admin" });
    }
  } else if (isOverShepherdRole(role)) {
    // Focused Over-Shepherd nav: a single "My Shepherds" entry. The directory
    // it links to arrives in the read-surface slice; this slice lands the
    // entry pointing at the placeholder landing.
    items.push({ href: "/over-shepherd", label: "My Leaders" });
  }
  // Shepherd (leader) surface gated per docs/adr/0002-oversight-ladder-and-leader-gating.md:
  // no leader nav entry is emitted for any role. leader / co_leader see only
  // the minimal no-access shell (Home).
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
  // (people, groups, calendar). Check-ins was dropped from this group per
  // docs/adr/0002-oversight-ladder-and-leader-gating.md (dead Shepherd→admin
  // reporting loop); Guests is intentionally dropped per PRODUCT_ROADMAP.md
  // EXT.1. Both routes still resolve so direct URLs / bookmarks work. See
  // docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the pivot rationale.
  const groups: AdminNavGroup[] = [
    {
      group: "top",
      label: "",
      items: [{ href: "/admin", label: "Admin", icon: "sun" }],
    },
    {
      group: "shepherd",
      // User-facing label is "Ministry Admin" (#177); "Admin OS" stays the
      // internal name for this spine in comments/docs.
      label: "Ministry Admin",
      // Group health (#146) joins the Admin OS spine as an oversight surface:
      // it ships dimension-complete with ADR 0007 placeholder labels and was
      // previously reachable only by direct URL.
      items: [
        { href: "/admin/shepherd-care", label: "Leader care", icon: "heart" },
        // Launch planning absorbs the former Capacity board and Multiplication
        // surfaces (ADR 0010 surface-budget consolidation); both old routes
        // redirect here. Leader pipeline stays its own destination.
        {
          href: "/admin/launch-planning",
          label: "Launch planning",
          icon: "compass",
        },
        {
          href: "/admin/leader-pipeline",
          label: "Leader pipeline",
          icon: "people",
        },
        { href: "/admin/follow-ups", label: "Follow-ups", icon: "flag" },
        { href: "/admin/group-health", label: "Group health", icon: "sprout" },
      ],
    },
    {
      group: "manage",
      label: "Manage",
      // Check-ins dropped from nav per
      // docs/adr/0002-oversight-ladder-and-leader-gating.md (dead Shepherd→admin
      // reporting loop). The /admin/check-ins route stays dormant and reachable
      // by direct URL under the admin guard.
      items: [
        { href: "/admin/people", label: "People", icon: "people" },
        { href: "/admin/groups", label: "Groups", icon: "groups" },
        { href: "/admin/calendar", label: "Calendar", icon: "cal" },
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
