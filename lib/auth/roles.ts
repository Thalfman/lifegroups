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

// The super_admin alone — the gate for the inline permanent-delete control and
// any other Super-Admin-only affordance. Distinct from isAdminRole, which also
// admits ministry_admin.
export function isSuperAdminRole(role: UserRole): boolean {
  return role === "super_admin";
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
  // Shepherd (leader) surface re-opened under the verify-before-flip gate (#376,
  // ADR 0017 amending ADR 0002 / under ADR 0009). leader / co_leader land on
  // /leader, whose requireLeader guard admits them only when the leader_surface
  // flag resolves enabled-and-verified — and redirects them to /unauthorized
  // otherwise. The landing path is the same either way; the guard, not this
  // mapping, holds the verify-before-flip gate.
  if (isLeaderRole(role)) return "/leader";
  return "/unauthorized";
}

export interface AdminArea {
  href: string;
  label: string;
  icon: string;
  // Nav-visibility flag key (ADR 0016). Present only on the three default-hidden
  // tabs (Groups, People, Planning): the area renders in nav ONLY when this flag
  // resolves on. Areas without a key are always visible. The key must match a
  // `nav_visibility` flag in lib/admin/feature-flags.ts (NAV_VISIBILITY_FLAGS);
  // a drift test guards the two from diverging.
  navFlagKey?: string;
}

// The job-oriented areas of the IA, now the Care/Plan/Multiply pivot set
// (ADR 0016, superseding ADR 0013's six-area spine). This is the single source
// of truth shared by every navigation surface — admin sidebar (adminNavGroups),
// Home Hub launcher tiles (lib/auth/hub-tiles.ts), and the bottom-nav list
// (navItemsForRole) — so all three stay consistent by construction. The hub
// tiles and bottom nav render this flat; the sidebar partitions it into
// divider-separated sections (ADMIN_NAV_SECTIONS) without reordering it.
//
// The flag-resolved spine is Home · Care · Plan · Multiply · Groups · People ·
// Settings: the Groups and People tabs carry a `navFlagKey` whose flag is
// seeded ON (ADR 0024, migration 20260701020000), and a Super Admin can hide
// either again by flipping its nav-visibility flag (resolveHiddenNav).
// Planning stays seeded OFF. The CODE default (no flag config read — demo
// routes, a failed read) still hides all three flagged tabs, so the nav fails
// safe to the ADR 0016 pivot spine; their routes always resolve by direct URL
// (ADR 0008/0009).
//
// Area→job mapping (ADR 0016): Care→leader/group care (absorbs Group-Health
// grading), Plan→the Interest Funnel (the former Guests pipeline aliases here),
// Multiply→per-type multiplication boards (the former launch-planning/calendar
// alias here), Home=cross-job triage, Settings=System utility. Plan and Multiply
// ship as minimal "being built" shells until their feature slices land.
//
// Care has ONE nav entry (/admin/care). /admin/shepherd-care is an intentional
// 200-alias of the same Care surface opened on a different default tab (the
// triage Dashboard) — NOT a stale duplicate. It is deliberately omitted here so
// the spine stays single-entry; the Home "Leader care" card links to it on
// purpose for triage drill-downs. See ADR 0013 and the header comment in
// app/(protected)/admin/shepherd-care/page.tsx.
export const ADMIN_AREAS: readonly AdminArea[] = [
  { href: "/admin", label: "Home", icon: "sun" },
  { href: "/admin/care", label: "Care", icon: "heart" },
  { href: "/admin/plan", label: "Plan", icon: "inbox" },
  { href: "/admin/multiply", label: "Multiply", icon: "sprout" },
  {
    href: "/admin/groups",
    label: "Groups",
    icon: "groups",
    navFlagKey: "nav_show_groups",
  },
  {
    href: "/admin/people",
    label: "People",
    icon: "people",
    navFlagKey: "nav_show_people",
  },
  {
    href: "/admin/planning",
    label: "Planning",
    icon: "compass",
    navFlagKey: "nav_show_planning",
  },
  { href: "/admin/settings", label: "Settings", icon: "cog" },
];

// The set of area hrefs hidden by default (those carrying a nav-visibility flag).
// Derived from ADMIN_AREAS so it can't drift from the area list. Used as the
// default `hiddenAreas` for the nav builders below, so a caller that resolves no
// flag config still gets the pivot default (Groups/People/Planning hidden), and
// mirrors lib/admin/feature-flags.ts DEFAULT_HIDDEN_NAV_AREAS.
export const DEFAULT_HIDDEN_ADMIN_AREAS: ReadonlySet<string> = new Set(
  ADMIN_AREAS.filter((a) => a.navFlagKey).map((a) => a.href)
);

// Filter ADMIN_AREAS to the areas that should render given a hidden-area set
// (resolveHiddenNav). An area is dropped when its href is in `hiddenAreas`;
// always-visible areas (no navFlagKey) are never affected. Defaults to the pivot
// default so an unspecified caller still hides Groups/People/Planning.
function visibleAdminAreas(
  hiddenAreas: ReadonlySet<string> = DEFAULT_HIDDEN_ADMIN_AREAS
): AdminArea[] {
  return ADMIN_AREAS.filter((a) => !hiddenAreas.has(a.href));
}

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
  role: UserRole,
  hiddenAreas: ReadonlySet<string> = DEFAULT_HIDDEN_ADMIN_AREAS
): { href: string; label: string }[] {
  if (isAdminRole(role)) {
    const items = visibleAdminAreas(hiddenAreas).map((a) => ({
      href: a.href,
      label: a.label,
    }));
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
  // Shepherd (leader) surface re-opened under the verify-before-flip gate (#376,
  // ADR 0017). leader / co_leader get a single focused "Care" entry pointing at
  // the /leader placeholder landing; the requireLeader guard on that route still
  // holds the verify-before-flip gate. No check-in entry point is surfaced here
  // — check-ins stay frozen behind their own gate.
  if (isLeaderRole(role)) {
    items.push({ href: "/leader", label: "Care" });
  }
  return items;
}

export type AdminNavGroupKey =
  | "home"
  | "top"
  | "manage"
  | "shepherd"
  | "system";

export type AdminNavItem = AdminArea;

export interface AdminNavGroup {
  group: AdminNavGroupKey;
  label: string;
  items: AdminNavItem[];
}

// Sidebar sections, in render order: Home alone, the Care/Plan/Multiply job
// spine, the management tabs, then system. Membership is by href so
// ADMIN_AREAS stays the flat single source of truth for the other nav
// surfaces; the "re-shows hidden tabs" test guards every area against falling
// out of all sections.
const ADMIN_NAV_SECTIONS: readonly {
  group: AdminNavGroupKey;
  hrefs: readonly string[];
}[] = [
  { group: "home", hrefs: ["/admin"] },
  { group: "top", hrefs: ["/admin/care", "/admin/plan", "/admin/multiply"] },
  {
    group: "manage",
    hrefs: ["/admin/groups", "/admin/people", "/admin/planning"],
  },
  { group: "system", hrefs: ["/admin/settings"] },
];

export function adminNavGroups(
  role: UserRole,
  hiddenAreas: ReadonlySet<string> = DEFAULT_HIDDEN_ADMIN_AREAS
): AdminNavGroup[] {
  // Care/Plan/Multiply spine (ADR 0016), partitioned into the unlabeled
  // ADMIN_NAV_SECTIONS — the Sidebar draws a hairline between groups instead of
  // section headers. Groups, People, and Planning are filtered out unless a
  // Super Admin has re-shown them (hiddenAreas, from resolveHiddenNav); their
  // routes still resolve by direct URL regardless (ADR 0008/0009). Super Admin
  // joins the system section only for super_admin (ADR 0002). Sections left
  // empty by flag filtering are dropped so no stray divider renders.
  const visible = visibleAdminAreas(hiddenAreas);
  const groups: AdminNavGroup[] = ADMIN_NAV_SECTIONS.map(
    ({ group, hrefs }) => ({
      group,
      label: "",
      items: visible
        .filter((a) => hrefs.includes(a.href))
        .map((a) => ({ ...a })),
    })
  );
  if (role === "super_admin") {
    groups
      .find((g) => g.group === "system")!
      .items.push({
        ...SUPER_ADMIN_AREA,
      });
  }
  return groups.filter((g) => g.items.length > 0);
}

// Sidebar nav groups for the lg shell (LgAppShell), resolved per role so the
// shell can dress non-admin surfaces too. Admin roles keep the exact admin-OS
// spine (adminNavGroups, unchanged), so the admin layout is byte-identical.
// Over-Shepherd gets its own single-destination sidebar ("My Leaders"),
// matching its focused navItemsForRole entry. Any other (no-access) role
// resolves to an empty sidebar — those callers never reach an lg-shell surface
// (they redirect to /unauthorized first), so this is only a safe fallback.
export function navGroupsForRole(
  role: UserRole,
  hiddenAreas: ReadonlySet<string> = DEFAULT_HIDDEN_ADMIN_AREAS
): AdminNavGroup[] {
  if (isAdminRole(role)) return adminNavGroups(role, hiddenAreas);
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
  // Leader surface re-opened (#376, ADR 0017): a single focused "Care" sidebar
  // entry pointing at the /leader placeholder landing. No check-in entry point.
  if (isLeaderRole(role)) {
    return [
      {
        group: "top",
        label: "",
        items: [{ href: "/leader", label: "Care", icon: "heart" }],
      },
    ];
  }
  return [];
}
