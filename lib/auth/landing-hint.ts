// A non-authoritative landing-path hint (ADR 0001/0016 launch-perf work).
//
// Why this exists: opening the bare domain `/` from an already-authenticated
// browser pays for the `force-dynamic` server render of app/page.tsx — a
// getUser() round trip + profile read — only to redirect to the role's surface
// (e.g. /admin). The dynamic `/` render is pure overhead on the common
// logged-in launch path. This hint lets middleware short-circuit that: it
// records the role's default landing path in a cookie set AFTER authoritative
// role resolution (login, and every protected page load), so a later root
// visit can redirect straight to the surface without rendering `/`.
//
// It is a UX shortcut ONLY, never authorization. A stale or tampered hint can
// at most route a user to the wrong surface, where the existing route guards
// (requireAdmin / requireLeader / requireOverShepherd, all switching on the
// live getCurrentSession()) still deny unauthorized access. Because of that the
// cookie is intentionally NOT httpOnly — a client component refreshes it via
// document.cookie, and it holds no secret.
//
// This module is deliberately free of Next.js imports so the logic stays pure
// and unit-testable; callers (login action, middleware, client refresher) do
// the cookie read/write.

import { defaultLandingPathForRole, type UserRole } from "./roles";

export const LANDING_HINT_COOKIE = "lg_landing_path";

// The only same-origin landing paths the hint may carry. Each is a fixed,
// guard-protected surface — mirrors the role-specific targets of
// defaultLandingPathForRole (admins → /admin, over_shepherd → /over-shepherd,
// leaders → /leader). A value outside this set is ignored, so the cookie can
// never redirect `/` to an arbitrary path.
export const LANDING_HINTS = ["/admin", "/leader", "/over-shepherd"] as const;

export type LandingHint = (typeof LANDING_HINTS)[number];

export function isValidLandingHint(value: unknown): value is LandingHint {
  return (
    typeof value === "string" &&
    (LANDING_HINTS as readonly string[]).includes(value)
  );
}

// The hint to store for an authoritative role. Reuses defaultLandingPathForRole
// (the single source of truth for where a role lands) and returns it only when
// it is one of the fixed landing paths — so a role with no app surface
// (defaultLandingPathForRole → /unauthorized) yields null and sets no hint.
export function landingHintForRole(role: UserRole): LandingHint | null {
  const path = defaultLandingPathForRole(role);
  return isValidLandingHint(path) ? path : null;
}

type LandingHintCookieOptions = {
  // Not httpOnly: the client refresher writes this via document.cookie, and the
  // hint holds no secret (it is non-authoritative — see file header).
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

// 30 days. The cookie is refreshed on every protected page load (the client
// refresher), so an active user keeps it fresh; an idle one simply loses the
// shortcut and falls back to the normal dynamic `/` render — no correctness
// impact either way.
export const LANDING_HINT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function baseOptions(maxAge: number): LandingHintCookieOptions {
  return {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

// Options for setting the hint (login action, server-side).
export function landingHintCookieSetOptions(): LandingHintCookieOptions {
  return baseOptions(LANDING_HINT_COOKIE_MAX_AGE_SECONDS);
}

// Options for clearing the hint on sign-out (maxAge 0).
export function landingHintCookieClearOptions(): LandingHintCookieOptions {
  return baseOptions(0);
}

// Build the document.cookie string the client refresher writes. Keeps the
// cookie-format logic in one tested place rather than hand-assembling it in the
// component. `secure` is passed in because the component can't read NODE_ENV.
export function landingHintCookieString(
  value: LandingHint,
  options: { secure: boolean }
): string {
  const parts = [
    `${LANDING_HINT_COOKIE}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${LANDING_HINT_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
