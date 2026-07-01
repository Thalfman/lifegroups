// Idle (inactivity) sign-out for authenticated sessions.
//
// Why this exists: a Supabase session here is effectively permanent. Its cookies
// default to a 400-day max-age (see password-setup.ts) and middleware refreshes
// them on every request, so the window slides forever and a user is never signed
// out. That is fine for convenience but not for an admin operating system that
// shepherds sensitive care data on shared or unattended machines.
//
// The mechanism: a "last active" cookie holding a millisecond timestamp.
// Middleware slides it forward on every authenticated request (so any activity
// keeps the session alive) and, before that, checks whether the gap since the
// previous bump exceeds the idle limit. If it does, the session is force-signed-
// out and the user is redirected to /login. A purely idle browser makes no
// requests, so its cookie is never bumped and the next request it does make
// trips the timeout — exactly the intended behaviour.
//
// This layers cleanly on top of the existing auth gate: after a force sign-out
// the Supabase session cookies are cleared, so getCurrentSession() resolves
// anonymous and the route guards redirect to /login regardless.
//
// This module is intentionally free of Next.js imports so the decision logic
// stays pure and unit-testable; callers do the cookie read/write and clock read.

import { PW_SETUP_COOKIE_MAX_AGE_SECONDS } from "./password-setup";

export const IDLE_COOKIE = "lg_last_active";

// 1 hour of inactivity. Balanced default for an admin tool: long enough not to
// interrupt an active working session, short enough to end an abandoned one.
export const IDLE_LIMIT_MS = 60 * 60 * 1000;

// The marker must OUTLIVE the idle window, not merely exceed it: the timestamp
// comparison is the sole authority on idleness, so the cookie has to still be
// PRESENT (just stale) when a long-idle request finally arrives. If the cookie
// expired first — as it would with a max-age near IDLE_LIMIT_MS — that request
// would carry no marker, `isIdleExpired(undefined)` would fail open to "fresh",
// and an overnight / long-abandoned session would never be signed out (the exact
// case this feature exists for). So match the Supabase session cookie's own
// lifetime (the same 400-day constant the password-setup marker uses) — the
// marker then never lapses before the session it guards.
const IDLE_COOKIE_MAX_AGE_SECONDS = PW_SETUP_COOKIE_MAX_AGE_SECONDS;

type IdleCookieOptions = {
  // httpOnly: the value is a session-lifecycle timestamp with no client consumer,
  // so keep it off document.cookie.
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

function baseOptions(maxAge: number): IdleCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

// Options for sliding the last-active marker forward on an active request.
export function idleCookieSetOptions(): IdleCookieOptions {
  return baseOptions(IDLE_COOKIE_MAX_AGE_SECONDS);
}

// Options for clearing the marker on a force sign-out (maxAge 0).
export function idleCookieClearOptions(): IdleCookieOptions {
  return baseOptions(0);
}

// True only when a parseable last-active timestamp is older than the idle limit.
// An absent, empty, or unparseable value is treated as a FRESH window (false),
// never an expiry — so a first visit (no cookie yet) and any malformed value
// fail open to "not idle" and let the session continue rather than bouncing the
// user to /login on garbage input. A future timestamp (clock skew) is likewise
// not idle.
export function isIdleExpired(
  lastActiveValue: string | undefined,
  nowMs: number
): boolean {
  if (!lastActiveValue) return false;
  const lastActiveMs = Number(lastActiveValue);
  if (!Number.isFinite(lastActiveMs)) return false;
  return nowMs - lastActiveMs > IDLE_LIMIT_MS;
}
