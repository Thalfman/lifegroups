// Admin route registry — the single, machine-checked source of truth for the
// status of every `/admin/*` route (issue #695, PR4).
//
// Each route carries an explicit status:
//   - `active`     — a canonical surface. Either an always-visible spine area
//                    (Care/Plan/Multiply/Settings/Home/Super-Admin), a
//                    flag-gated nav area (Groups/People/Planning), or a child of
//                    one of those.
//   - `alias`      — no nav entry of its own; 200-resolves and marks a canonical
//                    area active (ADR 0008/0009). Carries `canonical`.
//   - `frozen`     — role-guarded, direct-URL only, retired from nav but NOT
//                    deleted; preserved until a replacement is verified. May
//                    still carry a `canonical` so visiting it highlights the
//                    area that absorbed it.
//   - `deprecated` — only when code/docs already mark a route so. (None today.)
//
// `aliasRoot: true` marks the routes that SEED the nav alias map
// (`NAV_ALIAS_TO_CANONICAL` in `active-nav.ts`, now derived from here via
// `deriveAliasMap()`). Children of an alias/frozen surface are covered by the
// alias map's prefix matching, so they appear here for completeness but are NOT
// alias roots. Deriving the map from this registry — instead of a second
// hand-kept literal — is the "single source of truth" the issue asks for, with
// no change to routing or HTTP behavior (a test pins the derived map).
//
// Status policy: reflect CURRENT behavior first (active if linked/canonical in
// nav, frozen if guarded-but-hidden, alias for the 200-aliases). Future desired
// status is a separate product decision. Where unclear, prefer `frozen` with a
// review note — never delete or reroute here.

export type RouteStatus = "active" | "alias" | "frozen" | "deprecated";

export interface RouteEntry {
  /** Route pattern as Next resolves it, e.g. "/admin/groups/[groupId]". */
  readonly path: string;
  readonly status: RouteStatus;
  /** For alias/frozen surfaces: the canonical area they highlight in nav. */
  readonly canonical?: string;
  /** True for the alias/frozen ROOTS that seed NAV_ALIAS_TO_CANONICAL. */
  readonly aliasRoot?: boolean;
  readonly note?: string;
}

export const ADMIN_ROUTE_REGISTRY: readonly RouteEntry[] = [
  // --- Active spine (always visible) --------------------------------------
  { path: "/admin", status: "active", note: "Admin landing / Home hub." },
  { path: "/admin/care", status: "active", note: "Primary Care surface." },
  {
    path: "/admin/plan",
    status: "active",
    note: "Plan — the Interest Funnel (ADR 0016 spine). NOT /admin/planning, the off-nav pre-pivot launch/calendar host.",
  },
  {
    path: "/admin/multiply",
    status: "active",
    note: "Primary Multiply surface.",
  },
  {
    path: "/admin/multiply/criteria",
    status: "active",
    note: "Child route; redirects to /admin/settings?tab=multiply.",
  },
  {
    path: "/admin/multiply/settings",
    status: "active",
    note: "Child route; redirects to /admin/settings?tab=groups.",
  },
  { path: "/admin/settings", status: "active", note: "System settings." },
  {
    path: "/admin/settings/people-import-template",
    status: "active",
    note: "CSV template route handler under Settings.",
  },
  {
    path: "/admin/super-admin",
    status: "active",
    note: "Super-Admin console (super_admin only).",
  },
  {
    path: "/admin/super-admin/clean-slate/export/[snapshotId]",
    status: "active",
    note: "Snapshot export route handler (super_admin only).",
  },

  // --- Active nav areas (flag-gated, hidden by default per ADR 0016/0024) --
  {
    path: "/admin/groups",
    status: "active",
    note: "Management area (nav_show_groups).",
  },
  { path: "/admin/groups/[groupId]", status: "active", note: "Group detail." },
  {
    path: "/admin/groups/[groupId]/calendar",
    status: "active",
    note: "Group calendar.",
  },
  {
    path: "/admin/people",
    status: "active",
    note: "Management area (nav_show_people).",
  },
  {
    path: "/admin/people/[kind]/[personId]",
    status: "active",
    note: "Person detail (kind = profile | member | guest).",
  },
  {
    path: "/admin/planning",
    status: "active",
    note: "Flag-gated nav area (nav_show_planning), seeded OFF — has its own nav entry, so it is not an alias. NOT /admin/plan (the Interest Funnel, ADR 0016): this is the pre-pivot Job-2 launch/calendar host (ADR 0013), KEPT off-nav per ADR 0033 as the canonical Planning host for its aliases. Consolidating it into Multiply needs a new ADR superseding 0033 — do not retire it from a registry note.",
  },

  // --- Aliases (no nav entry; 200-resolve; mark a canonical area active) ----
  {
    path: "/admin/shepherd-care",
    status: "alias",
    canonical: "/admin/care",
    aliasRoot: true,
    note: "200-alias of Care opened on the triage tab. PRODUCT REVIEW: may become an active Care-detail surface.",
  },
  {
    path: "/admin/shepherd-care/[profileId]",
    status: "alias",
    canonical: "/admin/care",
    note: "Care detail; covered by alias prefix matching.",
  },
  {
    path: "/admin/shepherd-care/over-shepherds",
    status: "alias",
    canonical: "/admin/care",
    note: "Over-shepherd roster; covered by alias prefix matching.",
  },
  {
    path: "/admin/shepherd-care/over-shepherds/[overShepherdId]",
    status: "alias",
    canonical: "/admin/care",
    note: "Over-shepherd detail; covered by alias prefix matching.",
  },
  {
    path: "/admin/follow-ups",
    status: "alias",
    canonical: "/admin/care",
    aliasRoot: true,
    note: "Care follow-ups alias.",
  },

  // --- Frozen surfaces (guarded, direct-URL only; highlight their owner) ----
  {
    path: "/admin/leader-pipeline",
    status: "frozen",
    canonical: "/admin/care",
    aliasRoot: true,
    note: "Leader-readiness pipeline absorbed by Care.",
  },
  {
    path: "/admin/group-health",
    status: "frozen",
    canonical: "/admin/care",
    aliasRoot: true,
    note: "Group-Health grading absorbed by Care.",
  },
  {
    path: "/admin/check-ins",
    status: "frozen",
    canonical: "/admin/care",
    aliasRoot: true,
    note: "Check-in history absorbed by Care (own gate still applies).",
  },
  {
    path: "/admin/check-ins/[groupId]",
    status: "frozen",
    canonical: "/admin/care",
    note: "Per-group check-in history; covered by alias prefix matching.",
  },
  {
    path: "/admin/launch-planning",
    status: "frozen",
    canonical: "/admin/multiply",
    aliasRoot: true,
    note: "Scenario planner absorbed by Multiply.",
  },
  {
    path: "/admin/calendar",
    status: "frozen",
    canonical: "/admin/multiply",
    aliasRoot: true,
    note: "Master calendar absorbed by Multiply.",
  },
  {
    path: "/admin/guests",
    status: "frozen",
    canonical: "/admin/plan",
    aliasRoot: true,
    note: "Guests pipeline superseded by the Plan Interest Funnel.",
  },
];

/**
 * Derive the nav alias map (`alias root path → canonical area`) from the
 * registry. This is the single source of truth `active-nav.ts` consumes, so the
 * map can never drift from the route status recorded here.
 */
export function deriveAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of ADMIN_ROUTE_REGISTRY) {
    if (!entry.aliasRoot) continue;
    if (!entry.canonical) {
      throw new Error(
        `Alias root ${entry.path} is missing a canonical target.`
      );
    }
    map[entry.path] = entry.canonical;
  }
  return map;
}

/** Look up a registry entry by exact route pattern. */
export function routeEntry(path: string): RouteEntry | undefined {
  return ADMIN_ROUTE_REGISTRY.find((e) => e.path === path);
}

/**
 * The registry-recorded canonical target for an alias/frozen route, or null
 * when the entry has none (e.g. /admin/planning, kept as the Planning alias
 * host per ADR 0033). The "this moved" affordances (#901) — the frozen-gate
 * redirect and the FrozenSurfaceBanner link — derive their targets from this
 * so the mapping can't fork from the registry.
 */
export function canonicalFor(path: string): string | null {
  return routeEntry(path)?.canonical ?? null;
}

/**
 * Current-vocabulary link labels for the canonical areas the frozen surfaces
 * point at (CONTEXT.md terms — Prospects live in the Interest Funnel under
 * Plan; never "Guests" / "check-in" phrasing in moved-to copy).
 */
export const CANONICAL_AREA_LABELS: Record<string, string> = {
  "/admin/care": "Care",
  "/admin/plan": "Plan — the Interest Funnel",
  "/admin/multiply": "Multiply",
};

/**
 * Per-route moved-to overrides for frozen surfaces whose registry `canonical`
 * (the NAV active-owner) is not the surface that actually contains the work.
 *
 *   - The leader pipeline highlights Care in the nav, but its workflow was
 *     re-homed to Multiply's Shepherds tab (ADR 0022/0030 — `?tab=leaders`
 *     keeps the ADR 0025 code identity; "Shepherds" is the user-facing term).
 *   - `null` suppresses the link entirely: per ADR 0033 the master calendar /
 *     launch panels still live only in PlanningView (Multiply hosts no
 *     calendar/launches/scenarios), weekly check-ins are "not yet
 *     replaceable — no canonical surface covers them" (Care renders no weekly
 *     review), and the all-groups health triage/editor lives only on
 *     /admin/group-health (Care shows per-group health badges and deep-links
 *     BACK here to edit — it does not host the triage table). Claiming a
 *     "current home" for those would send an old bookmark to a page that
 *     does not contain the work.
 */
const MOVED_TO_OVERRIDES: Record<
  string,
  { href: string; label: string } | null
> = {
  "/admin/leader-pipeline": {
    href: "/admin/multiply?tab=leaders",
    label: "Multiply — the Shepherds tab",
  },
  "/admin/calendar": null,
  "/admin/launch-planning": null,
  "/admin/check-ins": null,
  "/admin/check-ins/[groupId]": null,
  "/admin/group-health": null,
};

/**
 * The moved-to link shape FrozenSurfaceBanner consumes: the per-route
 * workflow-home override when one exists (null = the work has no live
 * replacement surface, so no link), else the registry canonical.
 */
export function movedToFor(
  path: string
): { href: string; label: string } | null {
  if (path in MOVED_TO_OVERRIDES) return MOVED_TO_OVERRIDES[path];
  const canonical = canonicalFor(path);
  if (!canonical) return null;
  return {
    href: canonical,
    label: CANONICAL_AREA_LABELS[canonical] ?? canonical,
  };
}

/** The set of canonical (`active`) route paths an alias/frozen entry may target. */
export function activeRoutePaths(): Set<string> {
  return new Set(
    ADMIN_ROUTE_REGISTRY.filter((e) => e.status === "active").map((e) => e.path)
  );
}
