"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";

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

  ctx.finish("ok", {
    actor_role,
    error_code: session.kind === "authenticated" ? undefined : "no_session",
  });
  redirect("/login");
}
