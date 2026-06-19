import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PW_SETUP_COOKIE,
  PW_SETUP_COOKIE_VALUE,
  passwordSetupCookieSetOptions,
  shouldRedirectToPasswordSetup,
} from "@/lib/auth/password-setup";
import {
  LANDING_HINT_COOKIE,
  isValidLandingHint,
} from "@/lib/auth/landing-hint";
import { getSupabaseEnvSafe } from "./config";

// Copy every Set-Cookie the working response accumulated (session cookies
// getClaims() rotated, the password-setup marker) onto a freshly-built
// redirect/rewrite response so it drops none of them.
function carryCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

export async function updateSupabaseSession(
  request: NextRequest
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  // Degrade gracefully on a missing OR misconfigured env: this runs on nearly
  // every request, so a thrown misconfig here would 500 the whole site
  // (including /login). getSupabaseEnvSafe logs the misconfig and returns null.
  const env = getSupabaseEnvSafe();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touch the session so the cookies get rotated when needed. getClaims()
  // verifies the JWT locally via the Web Crypto API when the project uses
  // asymmetric signing keys (the default for new projects), avoiding an
  // auth-server round trip on every request; it transparently falls back to a
  // getUser() network call when symmetric keys are in use, so it is never
  // slower than getUser(). This is safe here because middleware performs no
  // authorization — it only refreshes the session. The actual auth gate
  // (getCurrentSession in lib/auth/session.ts) still uses getUser() so a
  // revoked/deleted Auth user is rejected on the next request, not at token
  // expiry.
  const { data: claimsData } = await supabase.auth.getClaims();

  // Pin a "password setup pending" session to the set-password screen. A session
  // created by verifying an invite / password-reset email link (app/auth/confirm)
  // is fully authenticated even when the account has no password yet, so without
  // this gate an invited user could navigate into the app and strand their
  // account with an empty password (every later sign-in then fails with the
  // generic "Invalid email or password"). The marker cookie is set by
  // /auth/confirm on a successful verify and cleared by resetPasswordAction once
  // a password is saved.
  const pwSetupAuthenticated = Boolean(claimsData?.claims);
  const pwSetupMarkerPresent =
    request.cookies.get(PW_SETUP_COOKIE)?.value === PW_SETUP_COOKIE_VALUE;

  // Keep the marker tracking the auth session. Supabase rotates its session
  // cookies on every request, so renew the marker on every authenticated request
  // that carries it — including allowed setup paths like /reset-password, not
  // just when we redirect — otherwise an idle session that keeps revisiting the
  // setup screen could extend its Supabase cookies while the marker expires out
  // from under it, and later slip past the gate. Limit to GET so this never
  // races the POST server actions that deliberately clear the marker
  // (completion / login / sign-out).
  if (
    pwSetupAuthenticated &&
    pwSetupMarkerPresent &&
    request.method === "GET"
  ) {
    response.cookies.set(
      PW_SETUP_COOKIE,
      PW_SETUP_COOKIE_VALUE,
      passwordSetupCookieSetOptions()
    );
  }

  if (
    shouldRedirectToPasswordSetup({
      authenticated: pwSetupAuthenticated,
      hasSetupCookie: pwSetupMarkerPresent,
      pathname: request.nextUrl.pathname,
    })
  ) {
    const target = request.nextUrl.clone();
    target.pathname = "/reset-password";
    target.search = "";
    const redirectResponse = NextResponse.redirect(target);
    // Carry over the session cookies getClaims() rotated above and the marker
    // renewed above so the redirect drops neither.
    carryCookies(response, redirectResponse);
    return redirectResponse;
  }

  // Fast path for an authenticated bare-domain (`/`) launch. The dynamic `/`
  // server render (app/page.tsx, force-dynamic) only resolves the session and
  // redirects to the role's surface (e.g. /admin) — pure overhead on the common
  // logged-in launch. If the role's landing-path hint cookie is present and
  // valid, redirect straight there from here so `/` never renders. The hint is
  // a non-authoritative UX shortcut: the destination's own route guard still
  // runs, so a stale/tampered hint can only mis-route, never bypass auth.
  // Restricted to GET (POST `/` is never a launch) and skipped when auth
  // callback params (`code` / `token_hash`) are present so an email link landing
  // on `/` is handled by the existing flow below instead of being hijacked.
  if (
    claimsData?.claims &&
    request.method === "GET" &&
    request.nextUrl.pathname === "/" &&
    !request.nextUrl.searchParams.has("code") &&
    !request.nextUrl.searchParams.has("token_hash")
  ) {
    const hint = request.cookies.get(LANDING_HINT_COOKIE)?.value;
    if (isValidLandingHint(hint)) {
      const target = request.nextUrl.clone();
      target.pathname = hint;
      target.search = "";
      const redirectResponse = NextResponse.redirect(target);
      // Carry over the session cookies getClaims() rotated above so the
      // redirect drops none of them.
      carryCookies(response, redirectResponse);
      return redirectResponse;
    }
  }

  // Serve the statically-generated /login document for anonymous visitors
  // landing on the bare domain. A rewrite (not a redirect) keeps the address
  // bar at "/" while the response is the CDN-cached static page, so the most
  // common public entry point never invokes the dynamic "/" server render
  // (cold start + session lookup). Authenticated requests fall through to the
  // dynamic Home Hub unchanged. getClaims() above is a local JWT verification,
  // so this gate adds no network round trip.
  if (!claimsData?.claims && request.nextUrl.pathname === "/") {
    // Safety net for auth email links (invite / password recovery) whose
    // redirect target wasn't honored, so Supabase sent the verified user to the
    // Site URL root with the auth params attached (`?code=` for the legacy PKCE
    // flow, or `?token_hash=&type=` for the token_hash flow). Without this, the
    // rewrite below would serve the sign-in page and discard them, stranding the
    // user. Forward to /reset-password (which gates verification behind a button
    // and shows the password-setup form) with the query string preserved.
    if (
      request.nextUrl.searchParams.has("code") ||
      request.nextUrl.searchParams.has("token_hash")
    ) {
      const acceptUrl = request.nextUrl.clone();
      acceptUrl.pathname = "/reset-password";
      const redirectResponse = NextResponse.redirect(acceptUrl);
      carryCookies(response, redirectResponse);
      return redirectResponse;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const rewriteResponse = NextResponse.rewrite(loginUrl, { request });
    // Carry over any cookies the Supabase client wrote during getClaims()
    // above — e.g. clearing stale/invalid session cookies on a failed refresh.
    // Returning a fresh rewrite response would otherwise drop those Set-Cookie
    // headers, leaving the bad cookies in place so every root visit keeps
    // re-paying the refresh/validation cost. (For a clean anonymous request
    // there are no cookies to copy, so this is a no-op on the common path.)
    carryCookies(response, rewriteResponse);
    return rewriteResponse;
  }

  return response;
}
