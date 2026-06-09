// Phase USAGE.1: pure mapping from an app pathname to the coarse "area" slug
// usage tracking records, plus the slug guard shared by the client beacon and
// the server-action trust boundary.
//
// The slug shape here is the SAME one log_usage_event validates in SQL
// (`^[a-z][a-z-]{0,31}$`), so a slug the beacon derives can never be rejected by
// the RPC, and a slug the RPC would reject can never be sent. Areas are
// structural facts only — a bounded token like "care" or "super-admin", never a
// path with ids or free text.

// Matches the SQL bound in log_usage_event: a lowercase token, 1–32 chars,
// letters and hyphens only, not starting with a hyphen.
const AREA_SLUG_RE = /^[a-z][a-z-]{0,31}$/;

// True when `value` is a well-formed area slug. Used to re-validate the
// client-supplied area at the server-action boundary before the RPC round-trip.
export function isUsageAreaSlug(value: unknown): value is string {
  return typeof value === "string" && AREA_SLUG_RE.test(value);
}

// Map a pathname (as returned by next/navigation usePathname — no query/hash)
// to the top-level area slug to record, or null for a path we don't attribute
// to an area (the beacon then fires nothing). Only the protected app surfaces
// are mapped; auth, login, and the public landing are deliberately not tracked
// as area views — a session's start is captured by the separate login event.
export function usageAreaForPathname(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const [first, second] = segments;

  if (first === "admin") {
    // Bare /admin is the admin Home; deeper paths take their first sub-segment
    // (care, plan, multiply, settings, groups, people, planning, super-admin,
    // shepherd-care, …). slugOrNull drops anything that isn't a clean slug.
    if (!second) return "home";
    return slugOrNull(second);
  }
  if (first === "leader") return "leader";
  if (first === "over-shepherd") return "over-shepherd";

  return null;
}

function slugOrNull(value: string): string | null {
  return AREA_SLUG_RE.test(value) ? value : null;
}
