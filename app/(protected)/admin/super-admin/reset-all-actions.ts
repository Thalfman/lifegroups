"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import { isRecord } from "@/lib/admin/validation";
import { adminRpc } from "@/lib/admin/rpc";
import {
  RESET_ALL_CONFIRM_PHRASE,
  type ResetAllSuccess,
} from "@/lib/admin/danger-zone";
import { LAUNCH_MUTE_FLAG_KEYS } from "@/lib/admin/feature-flags";
import type { CleanSlateSnapshotsRow } from "@/types/database";

const REVALIDATE_PATH = "/admin/super-admin";

function readForm(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (isRecord(input)) return input;
  return {};
}

// Danger-Zone consolidation: one guarded step that makes the app read as a true
// clean launch state. The work lives in the super_admin_reset_all RPC so it runs
// in one transaction (all-or-nothing), composing the existing audited RPCs:
//
//   1. launch prep — mute the three time-based launch warnings + clear all
//      accumulated history (recoverable snapshot first; an already-empty history
//      is not an error) + purge per-category snapshots.
//   2. reset the leader-care "Needs attention" card to a clean global baseline.
//   3. reset the health-check "Needs attention" card to a clean global baseline.
//
// The whole step is idempotent — re-running on a clean database succeeds with no
// rows cleared. People, groups, leaders, memberships, settings, care profiles &
// notes, and the audit log are kept. Each piece remains separately revertable
// from its own Danger-Zone card.
export async function superAdminResetAll(
  _prev: ActionResult<ResetAllSuccess> | undefined,
  input: unknown
): Promise<ActionResult<ResetAllSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== RESET_ALL_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${RESET_ALL_CONFIRM_PHRASE} exactly to confirm resetting everything.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  // The RPC composes launch prep + both attention resets atomically; it is
  // idempotent (never raises nothing_to_wipe), so a returned null id just means
  // "history was already clear", not a failure.
  const { data: snapshotId, error } = await adminRpc(
    client,
    "super_admin_reset_all",
    {}
  );
  if (error) return actionFail([mapRpcError(error.message)]);

  // Read the cleared total back from the history snapshot row by id (RLS-gated
  // SELECT), never through the uuid return channel. No snapshot ⇒ nothing wiped.
  let clearedRows = 0;
  if (snapshotId) {
    const { data: snapshot } = await client
      .from("clean_slate_snapshots")
      .select("total_rows")
      .eq("id", snapshotId)
      .maybeSingle<Pick<CleanSlateSnapshotsRow, "total_rows">>();
    const total = Number(snapshot?.total_rows);
    clearedRows = Number.isFinite(total) ? total : 0;
  }

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  revalidatePath("/admin/shepherd-care");
  revalidatePath("/admin/group-health");
  return actionOk({
    clearedRows,
    mutedKeys: [...LAUNCH_MUTE_FLAG_KEYS],
    snapshotId,
  });
}
