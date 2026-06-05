import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./config";

export async function updateSupabaseSession(
  request: NextRequest
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = getSupabaseEnv();
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
    // Site URL root with the auth `?code=` attached. Without this, the rewrite
    // below would serve the sign-in page and discard the code, stranding the
    // invitee. Forward them to /reset-password (which exchanges the code and
    // shows the password-setup form) with the code preserved.
    if (request.nextUrl.searchParams.has("code")) {
      const acceptUrl = request.nextUrl.clone();
      acceptUrl.pathname = "/reset-password";
      const redirectResponse = NextResponse.redirect(acceptUrl);
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
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
    response.cookies.getAll().forEach((cookie) => {
      rewriteResponse.cookies.set(cookie);
    });
    return rewriteResponse;
  }

  return response;
}
