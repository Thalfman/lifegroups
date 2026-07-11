// Narrow read of the caller's own first-run orientation state (#560). The
// first_run_orientations table is RPC-only (no SELECT policy), so this goes
// through the first_run_orientation_seen() SECURITY DEFINER helper. Degrades to
// "seen" (true) on a failed read so a flaky read never nags the user — the row
// is still absent in the DB, so a later successful read shows the card.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { callJsonRpc } from "@/lib/shared/rpc";

export async function readFirstRunOrientationSeen(
  client: AppSupabaseClient
): Promise<boolean> {
  const r = await callJsonRpc(client, "first_run_orientation_seen", {});
  if (r.error) return true;
  return r.data === true;
}
