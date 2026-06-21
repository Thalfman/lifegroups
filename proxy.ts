import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy` (both the file
// and the exported function move). Behavior is unchanged: every matched request
// refreshes the Supabase session cookie via `updateSupabaseSession` (the
// read-path RLS scoping and password-setup gate live in that helper).
export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    // Skip session-refresh on public PWA metadata. The manifest and the
    // extensionless generated icon routes (/icons/*) must stay reachable
    // without auth — otherwise a signed-in invite/reset user carrying the
    // password-setup cookie would have those fetches redirected to
    // /reset-password instead of receiving the metadata. /api/vitals is also
    // excluded: the web-vitals beacon needs no session, so refreshing it there
    // would add a getClaims() round trip to the very surface it measures.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|api/vitals|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
