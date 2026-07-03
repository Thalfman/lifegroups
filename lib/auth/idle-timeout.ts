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
// Threat model: the marker is a server-written integrity signal (httpOnly, only
// our code sets it), but it lives in the browser's cookie jar — the person at
// the keyboard can delete or garble it from devtools. The guard therefore FAILS
// CLOSED for authenticated sessions: an absent or unparseable marker on a
// request that carries a live session is treated as idle-expired and signed
// out, so deleting the cookie cannot mint a fresh idle window (the unattended-
// machine attack this feature exists to stop). Anonymous requests never consult
// the marker at all — the middleware guard runs only when session claims are
// present — so a genuine first visit is unaffected.
//
// Seeding contract (why fail-closed is safe): loginAction is the sole seeder of
// the marker for a persisting session. Every other session creator is either
// waived from the guard while its password-setup marker is present (invite /
// recovery sessions, plus the /auth/confirm handshake itself) or ends in an
// immediate sign-out (reset-password completion). Residual risk after
// hardening: an attacker who can WRITE cookies (not just delete them) can still
// forge a fresh timestamp — indistinguishable from real activity without a
// server-side session store, and out of scope here.
//
// This module is intentionally free of Next.js imports so the decision logic
// stays pure and unit-testable; callers do the cookie read/write and clock read.

import { PW_SETUP_COOKIE_MAX_AGE_SECONDS } from "./password-setup";

export const IDLE_COOKIE = "lg_last_active";

// 1 hour of inactivity. Balanced default for an admin tool: long enough not to
// interrupt an active working session, short enough to end an abandoned one.
export const IDLE_LIMIT_MS = 60 * 60 * 1000;

// The marker outlives the idle window by matching the Supabase session cookie's
// own lifetime (the same 400-day constant the password-setup marker uses). This
// is no longer load-bearing for correctness — a lapsed marker now fails CLOSED
// (treated as idle-expired), so a shorter max-age could not reopen the
// overnight-session hole — but the long lifetime keeps behavior stable for
// long-lived active sessions: the marker never expires out from under a session
// that is still making requests, so an active user is only ever signed out by
// genuine inactivity, never by cookie lapse.
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

// True when a parseable last-active timestamp is older than the idle limit —
// and also when the marker is absent, empty, or unparseable. Call this only for
// requests that carry an authenticated session: login always seeds the marker,
// so a session without a trustworthy one means the cookie was deleted or
// tampered with, and the only safe reading is "idle-expired" (fail closed).
// Anonymous requests must not reach this predicate — the middleware guard is
// gated on session claims, so a true first visit is never bounced. A parseable
// FUTURE timestamp (clock skew across instances, a corrected clock) is not
// idle: it is a server-written marker whatever its sign, and the same request
// slides it to "now", so skew self-heals in one hop.
export function isIdleExpired(
  lastActiveValue: string | undefined,
  nowMs: number
): boolean {
  if (!lastActiveValue) return true;
  const lastActiveMs = Number(lastActiveValue);
  if (!Number.isFinite(lastActiveMs)) return true;
  return nowMs - lastActiveMs > IDLE_LIMIT_MS;
}
