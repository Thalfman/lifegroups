"use server";

// Phase USAGE.1: the server action the client UsageBeacon calls when a user
// enters a new top-level area. Best-effort by construction — it never throws and
// never blocks navigation. The log_usage_event RPC self-gates on the
// usage_tracking flag, so this records nothing while tracking is off.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rpcLogUsageEvent } from "@/lib/usage/rpc";
import { isUsageAreaSlug } from "@/lib/usage/areas";

export async function recordAreaView(area: string): Promise<void> {
  // Re-validate the client-supplied slug at the trust boundary. The RPC
  // validates again server-side; rejecting here just avoids a pointless write
  // for a malformed value.
  if (!isUsageAreaSlug(area)) return;

  const client = await createSupabaseServerClient();
  if (!client) return;

  try {
    await rpcLogUsageEvent(client, {
      p_event_type: "area_view",
      p_area: area,
    });
  } catch {
    // Telemetry is best-effort: a failed usage write must never affect the
    // surface that triggered it.
  }
}
