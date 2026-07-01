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
  landingHintCookieClearOptions,
} from "@/lib/auth/landing-hint";
import {
  IDLE_COOKIE,
  idleCookieClearOptions,
  idleCookieSetOptions,
  isIdleExpired,
} from "@/lib/auth/idle-timeout";
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

  // Password-setup-pending marker. Read up here because the idle guard below
  // must also consult it (as does the set-password gate further down). A session
  // created by verifying an invite / password-reset email link (app/auth/confirm)
  // is fully authenticated even when the account has no password yet.
  const pwSetupAuthenticated = Boolean(claimsData?.claims);
  const pwSetupMarkerPresent =
    request.cookies.get(PW_SETUP_COOKIE)?.value === PW_SETUP_COOKIE_VALUE;

  // Idle (inactivity) sign-out. A "last active" cookie holds a millisecond
  // timestamp; every authenticated request slides it forward, and a request that
  // arrives more than IDLE_LIMIT_MS after the last bump resumes an abandoned
  // session and is force-signed-out. A purely idle browser makes no requests, so
  // its marker is never bumped and the next request it makes trips the timeout.
  // The marker outlives the Supabase session window (idle-timeout.ts), so a
  // long-idle request still carries a STALE marker to detect rather than an
  // absent one. Two carve-outs:
  //   - the /auth/confirm verify handshake is waived: it runs verifyOtp, which
  //     replaces any stale session with the link's account, so it must not be
  //     interrupted. Every OTHER path is enforced — including `/` and
  //     `/reset-password` with a link token — so a stale session can't opt out by
  //     appending `?code=` to a route, and can't reach the reset form (which
  //     renders for ANY existing session, before the token is consumed) with the
  //     stale account still live. A link token on those paths is carried through
  //     the sign-out below so the flow still completes.
  //   - password-setup-pending sessions are waived: password-setup.ts keeps that
  //     single-use, passwordless session alive on purpose (it is the only session
  //     that can finish setup), so timing it out would strand the account.
  // Session lifecycle only: no DB write, no audit event.
  const pathname = request.nextUrl.pathname;
  const hasAuthLinkToken =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token_hash");
  const isVerifyHandshake = hasAuthLinkToken && pathname === "/auth/confirm";
  if (claimsData?.claims && !isVerifyHandshake && !pwSetupMarkerPresent) {
    const nowMs = Date.now();
    const lastActive = request.cookies.get(IDLE_COOKIE)?.value;
    if (isIdleExpired(lastActive, nowMs)) {
      // `local` scope mirrors logoutAction: end only this device's session. This
      // clears the Supabase session cookies through the client's setAll above
      // (rebuilding `response`), so getCurrentSession() resolves anonymous next.
      // @supabase/auth-js only drops those cookies when sign-out SUCCEEDS, so gate
      // the marker clear on it: on a transient GoTrue failure the session is still
      // live, so PRESERVE the stale marker — clearing it would hand the still-
      // authenticated browser a fresh idle window on the next request.
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });
      const signedOut = !signOutError;
      if (signedOut) {
        response.cookies.set(IDLE_COOKIE, "", idleCookieClearOptions());
      }
      response.cookies.set(
        LANDING_HINT_COOKIE,
        "",
        landingHintCookieClearOptions()
      );
      // Carry an auth email-link token through the sign-out so the flow can still
      // complete: a successfully-ended session that landed on `/` or
      // `/reset-password` with a token is forwarded to /reset-password KEEPING the
      // params, so the now-anonymous browser shows the verify button instead of
      // losing the token at /login. If sign-out FAILED the session is still live,
      // so never route to the reset form (it renders for the live stale account) —
      // send to /login and let the preserved marker re-fire the timeout next time.
      const isAuthLinkLanding =
        pathname === "/" || pathname === "/reset-password";
      const target = request.nextUrl.clone();
      if (signedOut && hasAuthLinkToken && isAuthLinkLanding) {
        target.pathname = "/reset-password";
        // keep the existing code / token_hash / type search params
      } else {
        target.pathname = "/login";
        target.search = "";
        target.searchParams.set("reason", "timeout");
      }
      // 303 See Other so a timed-out POST (form / server action) follows the
      // redirect as a GET instead of re-POSTing its body (the default 307 would
      // preserve the method and body).
      const redirectResponse = NextResponse.redirect(target, 303);
      // Carry the cleared session/marker cookies onto the redirect so none of
      // the Set-Cookie deletions are dropped.
      carryCookies(response, redirectResponse);
      return redirectResponse;
    }
    // Active request: slide the window forward.
    response.cookies.set(IDLE_COOKIE, String(nowMs), idleCookieSetOptions());
  }

  // Pin a "password setup pending" session to the set-password screen. Without
  // this gate an invited user could navigate into the app and strand their
  // account with an empty password (every later sign-in then fails with the
  // generic "Invalid email or password"). The marker cookie is set by
  // /auth/confirm on a successful verify and cleared by resetPasswordAction once
  // a password is saved. (pwSetupAuthenticated / pwSetupMarkerPresent are read
  // above so the idle guard can exempt setup-pending sessions.)

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

  // Self-heal a stale landing hint. A role guard that denies access lands the
  // user on /unauthorized, and the hint is set for up to 30 days — so if a
  // signed-in user's role changed since the cookie was written (e.g. a Super
  // Admin moved a ministry_admin to over_shepherd), the fast path above would
  // send `/` → /admin → requireAdmin → /unauthorized, and the page's "Back to
  // home" link (→ `/`) would loop straight back through the same stale
  // redirect. Middleware can't revalidate the hint against the live role (it
  // does no DB read), so clear it here at the denial landing instead: the next
  // `/` visit then renders normally, and the protected-layout refresher
  // re-establishes the correct hint on the first surface the user can actually
  // reach. Clearing a still-valid hint is harmless — it only costs one ordinary
  // `/` render before it's re-set.
  if (
    request.nextUrl.pathname === "/unauthorized" &&
    request.cookies.has(LANDING_HINT_COOKIE)
  ) {
    response.cookies.set(
      LANDING_HINT_COOKIE,
      "",
      landingHintCookieClearOptions()
    );
  }

  return response;
}
