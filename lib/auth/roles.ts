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

export interface AdminArea {
  href: string;
  label: string;
  icon: string;
}

// The six job-oriented areas of the reduced IA (ADR 0013). This is the single
// source of truth shared by every navigation surface — admin sidebar
// (adminNavGroups), Home Hub launcher tiles (lib/auth/hub-tiles.ts), and the
// bottom-nav list (navItemsForRole) — so all three stay consistent by
// construction. Rendered as a flat list, no section headers.
//
// Area→job mapping (ADR 0013, amending ADR 0010): Groups→job 3 (group health),
// Care→job 1 (leader care), Planning→job 2 (launch), Home=cross-job triage,
// People=shared substrate, Settings=System utility. Care/Planning point at the
// new landing shells (#298); the frozen routes they will host
// (shepherd-care, follow-ups, launch-planning, calendar, group-health) keep
// their paths and still resolve directly (ADR 0008/0009).
export const ADMIN_AREAS: readonly AdminArea[] = [
  { href: "/admin", label: "Home", icon: "sun" },
  { href: "/admin/groups", label: "Groups", icon: "groups" },
  { href: "/admin/care", label: "Care", icon: "heart" },
  { href: "/admin/people", label: "People", icon: "people" },
  { href: "/admin/planning", label: "Planning", icon: "compass" },
  { href: "/admin/settings", label: "Settings", icon: "cog" },
];

// Super Admin is NOT one of the six areas (ADR 0002): it is appended only for
// super_admin and is otherwise unchanged. It must never be hidden or replaced
// by the six-area structure.
export const SUPER_ADMIN_AREA: AdminArea = {
  href: "/admin/super-admin",
  label: "Super admin",
  icon: "star",
};

// Bottom-nav list, realigned to the six areas (ADR 0013). Admin roles get the
// flat six (Home → /admin), plus the Super Admin entry for super_admin. The
// Home Hub at `/` is the pre-admin landing — kept as the lone item for
// non-admin roles, but it is not one of the six areas.
export function navItemsForRole(
  role: UserRole
): { href: string; label: string }[] {
  if (isAdminRole(role)) {
    const items = ADMIN_AREAS.map((a) => ({ href: a.href, label: a.label }));
    if (role === "super_admin") {
      items.push({
        href: SUPER_ADMIN_AREA.href,
        label: SUPER_ADMIN_AREA.label,
      });
    }
    return items;
  }
  const items: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
  ];
  if (isOverShepherdRole(role)) {
    // Focused Over-Shepherd nav: a single "My Leaders" entry. The directory it
    // links to arrives in the read-surface slice; this slice lands the entry
    // pointing at the placeholder landing.
    items.push({ href: "/over-shepherd", label: "My Leaders" });
  }
  // Shepherd (leader) surface gated per docs/adr/0002-oversight-ladder-and-leader-gating.md:
  // no leader nav entry is emitted for leader / co_leader — they see only the
  // minimal no-access shell (Home).
  return items;
}

export type AdminNavGroupKey = "top" | "manage" | "shepherd" | "system";

export type AdminNavItem = AdminArea;

export interface AdminNavGroup {
  group: AdminNavGroupKey;
  label: string;
  items: AdminNavItem[];
}

export function adminNavGroups(role: UserRole): AdminNavGroup[] {
  // Six-area spine (ADR 0013): a single flat group with no section header
  // (empty label) renders the six areas as a flat list, collapsing the former
  // grouped sidebar (top / Ministry Admin / Manage / System). Super Admin is
  // appended only for super_admin and is unchanged (ADR 0002). The frozen
  // surfaces these areas will host (shepherd-care, follow-ups, launch-planning,
  // calendar, group-health) keep their routes and resolve by direct URL
  // (ADR 0008/0009).
  const items: AdminNavItem[] = ADMIN_AREAS.map((a) => ({ ...a }));
  if (role === "super_admin") {
    items.push({ ...SUPER_ADMIN_AREA });
  }
  return [{ group: "top", label: "", items }];
}

// Sidebar nav groups for the lg shell (LgAppShell), resolved per role so the
// shell can dress non-admin surfaces too. Admin roles keep the exact admin-OS
// spine (adminNavGroups, unchanged), so the admin layout is byte-identical.
// Over-Shepherd gets its own single-destination sidebar ("My Leaders"),
// matching its focused navItemsForRole entry. Any other (no-access) role
// resolves to an empty sidebar — those callers never reach an lg-shell surface
// (they redirect to /unauthorized first), so this is only a safe fallback.
export function navGroupsForRole(role: UserRole): AdminNavGroup[] {
  if (isAdminRole(role)) return adminNavGroups(role);
  if (isOverShepherdRole(role)) {
    return [
      {
        group: "top",
        label: "",
        items: [
          { href: "/over-shepherd", label: "My Leaders", icon: "people" },
        ],
      },
    ];
  }
  return [];
}
