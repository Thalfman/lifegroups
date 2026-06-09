// Gate for sessions that still need a password set.
//
// Why this exists: clicking an invite or password-reset email link verifies a
// single-use token (app/auth/confirm -> verifyOtp), which establishes a FULL
// Supabase session. For a freshly invited account that session is authenticated
// even though no password has been set yet (auth.users.encrypted_password is
// empty). Without a gate the user can navigate straight into the app — the
// reset page header even links to "/" — and never submit the set-password form.
// The account is then stranded with no password, and every later sign-in fails
// with the generic "Invalid email or password" because GoTrue has nothing to
// check the password against.
//
// The flow:
//   1. /auth/confirm sets PW_SETUP_COOKIE on a successful verify.
//   2. Middleware pins the session to /reset-password while the cookie is
//      present (shouldRedirectToPasswordSetup).
//   3. The marker is cleared the moment the session stops being
//      password-setup-pending: resetPasswordAction clears it once
//      updateUser({ password }) succeeds, loginAction clears it on a successful
//      password sign-in, and logoutAction clears it on sign-out.
//
// This module is intentionally free of Next.js imports so the decision logic
// stays pure and unit-testable; callers do the cookie read/write.

export const PW_SETUP_COOKIE = "lg_pw_setup";
export const PW_SETUP_COOKIE_VALUE = "1";

// The gate must hold for the WHOLE auth session, not a fixed short window: the
// verifyOtp session is a full session whose cookies can outlive a brief marker,
// and if the marker lapsed first a password-less invited user could wait it out
// and then wander into the app — recreating the stranding this guards against.
// So the marker is cleared explicitly on completion / login / sign-out (see
// above) rather than relied on to expire, and its max-age is only a generous
// safety cap that comfortably outlives a normal session. /reset-password offers
// a "sign out" escape so a long-lived marker can never trap a user who changed
// their mind.
export const PW_SETUP_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Paths a password-setup-pending session may reach. Everything else bounces to
// /reset-password. Kept deliberately small: the set-password screen and its
// server action (same path), the verification endpoint, and the two escape
// hatches (request a fresh link, or land on /login after completion/sign-out).
const ALLOWED_PREFIXES = [
  "/reset-password",
  "/auth/confirm",
  "/forgot-password",
  "/login",
];

export function isPasswordSetupAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// True only when an authenticated visitor carrying the setup marker is trying
// to reach a path outside the allow-list. Anonymous requests and ordinary
// (non-marker) sessions are never gated.
export function shouldRedirectToPasswordSetup(input: {
  authenticated: boolean;
  hasSetupCookie: boolean;
  pathname: string;
}): boolean {
  if (!input.authenticated) return false;
  if (!input.hasSetupCookie) return false;
  return !isPasswordSetupAllowedPath(input.pathname);
}

type PasswordSetupCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

function baseOptions(maxAge: number): PasswordSetupCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

// Options for setting the marker when the verify succeeds.
export function passwordSetupCookieSetOptions(): PasswordSetupCookieOptions {
  return baseOptions(PW_SETUP_COOKIE_MAX_AGE_SECONDS);
}

// Options for clearing the marker once a password has been saved (maxAge 0).
export function passwordSetupCookieClearOptions(): PasswordSetupCookieOptions {
  return baseOptions(0);
}
