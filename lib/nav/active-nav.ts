// Sidebar active-state resolution (issue #321).
//
// The sidebar renders the six-area spine (ADR 0013). Active styling is purely
// visual today; this module is the pure, reusable spine that drives both the
// visual highlight AND `aria-current="page"` so assistive tech reports the same
// "you are here" the sighted user sees.
//
// Two jobs, kept free of React/JSX so they unit-test cleanly:
//
//   1. isActiveNavHref — does a nav item's href own the current path? Preserves
//      the `/admin` exact-match rule (Home only lights on exactly /admin, never
//      on /admin/groups), and otherwise treats `href` as a path prefix.
//
//   2. The alias→canonical map — several frozen surfaces (ADR 0008/0009) keep
//      their own routes and resolve by direct URL, but they have NO nav entry of
//      their own. Visiting one should still highlight the canonical area that
//      OWNS it (e.g. /admin/shepherd-care lives under Care). The map below
//      records that ownership so a frozen alias URL marks its owning area active.
//
// Later Care/Planning canonicalization slices reuse this map as the single
// source of truth for which area a frozen surface belongs to.

// Frozen alias path → the canonical area href that owns it. These alias paths
// stay directly resolvable (200) per ADR 0013 — this is nav active-state only,
// no routing changes. Keys are exact, leading-slash, no trailing slash.
export const NAV_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  "/admin/shepherd-care": "/admin/care",
  "/admin/launch-planning": "/admin/planning",
  "/admin/calendar": "/admin/planning",
  "/admin/follow-ups": "/admin/care",
  "/admin/leader-pipeline": "/admin/people",
  "/admin/group-health": "/admin/groups",
  // Attendance/check-in history lives under Groups in the reduction plan, so the
  // frozen check-ins surface marks Groups active (ADR 0013 lists it among the
  // frozen direct URLs that own no nav entry).
  "/admin/check-ins": "/admin/groups",
};

// Map an arbitrary path to the path used for active-state matching. A frozen
// alias resolves to its owning canonical area; any other path resolves to
// itself. Pure and total — unknown paths pass through unchanged.
//
// Matching is exact first, then alias-as-prefix: a direct child of a frozen
// alias (e.g. /admin/shepherd-care/over-shepherds or /admin/check-ins/[groupId])
// belongs to the same owning area as the alias root, so it resolves to that
// canonical area too rather than passing through unmatched.
export function resolveCanonicalPath(pathname: string): string {
  const exact = NAV_ALIAS_TO_CANONICAL[pathname];
  if (exact) return exact;
  for (const [alias, canonical] of Object.entries(NAV_ALIAS_TO_CANONICAL)) {
    if (pathname.startsWith(`${alias}/`)) return canonical;
  }
  return pathname;
}

// Does `href` (a nav item's destination) own `pathname`? The current path is
// first resolved through the alias map so a frozen alias URL is matched against
// the area that owns it. The `/admin` Home entry keeps its exact-match special
// case so it never lights up for any deeper /admin/* route.
export function isActiveNavHref(pathname: string, href: string): boolean {
  const path = resolveCanonicalPath(pathname);
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}
