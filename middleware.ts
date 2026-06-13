import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    // Skip session-refresh on public PWA metadata. The manifest and the
    // extensionless generated icon routes (/icons/*) must stay reachable
    // without auth — otherwise a signed-in invite/reset user carrying the
    // password-setup cookie would have those fetches redirected to
    // /reset-password instead of receiving the metadata.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
