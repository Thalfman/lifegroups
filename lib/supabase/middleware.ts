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
  // slower than getUser().
  await supabase.auth.getClaims();
  return response;
}
