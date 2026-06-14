"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { rpcMarkFirstRunOrientationSeen } from "@/lib/account/rpc";

export type OrientationSeenState = { ok: boolean };

// Self-service write (#560): records that the signed-in user dismissed their
// first-run orientation card. Invoked imperatively from the card's "Got it"
// button (useTransition), so it returns a small result rather than redirecting.
// Shared by the Leader and Over-Shepherd surfaces.
export async function markFirstRunOrientationSeenAction(): Promise<OrientationSeenState> {
  const ctx = startActionLog("account.mark_orientation_seen");

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return { ok: false };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    ctx.finish("denied", { error_code: "no_session" });
    return { ok: false };
  }

  const rpc = await rpcMarkFirstRunOrientationSeen(client);
  if (rpc.error) {
    ctx.finish("fail", { error_code: "mark_orientation_failed" });
    return { ok: false };
  }

  ctx.finish("ok");
  return { ok: true };
}
