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
//   3. resetPasswordAction clears the cookie once updateUser({ password })
//      succeeds, releasing the session into the app.
//
// This module is intentionally free of Next.js imports so the decision logic
// stays pure and unit-testable; callers do the cookie read/write.

export const PW_SETUP_COOKIE = "lg_pw_setup";
export const PW_SETUP_COOKIE_VALUE = "1";

// Recovery/invite sessions are short-lived and the set-password step takes
// seconds. Bound the marker to 30 minutes so an abandoned attempt can't pin a
// session indefinitely, while still comfortably covering a real completion.
export const PW_SETUP_COOKIE_MAX_AGE_SECONDS = 30 * 60;

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
