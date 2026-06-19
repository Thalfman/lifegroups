"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  PW_SETUP_COOKIE,
  passwordSetupCookieClearOptions,
} from "@/lib/auth/password-setup";
import {
  LANDING_HINT_COOKIE,
  landingHintCookieClearOptions,
} from "@/lib/auth/landing-hint";

export async function logoutAction(): Promise<void> {
  const ctx = startActionLog("auth.logout");

  // getCurrentSession is React-cached, so this reuses the per-request lookup
  // already done by the protected layout. Captured before sign-out so the log
  // line carries the role of the user being logged out.
  const session = await getCurrentSession();
  const actor_role =
    session.kind === "authenticated" ? session.profile.role : null;

  const client = await createSupabaseServerClient();
  if (client) {
    // `local` scope so signing out on one device doesn't revoke the user's
    // sessions on every other device they're logged in on.
    await client.auth.signOut({ scope: "local" });
  }

  // Sign-out is the explicit escape from the set-password gate; drop the marker
  // so the next request isn't bounced back to /reset-password.
  const cookieStore = await cookies();
  cookieStore.set(PW_SETUP_COOKIE, "", passwordSetupCookieClearOptions());
  // Drop the landing-path hint so the next sign-in re-resolves it fresh.
  cookieStore.set(LANDING_HINT_COOKIE, "", landingHintCookieClearOptions());

  ctx.finish("ok", {
    actor_role,
    error_code: session.kind === "authenticated" ? undefined : "no_session",
  });
  redirect("/login");
}
