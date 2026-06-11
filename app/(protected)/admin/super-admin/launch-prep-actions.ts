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
  LAUNCH_PREP_CONFIRM_PHRASE,
  type LaunchPrepSuccess,
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

// One-click launch prep: make the app read as a true clean slate for launch in a
// single guarded, ATOMIC step. The work lives in the super_admin_launch_prep RPC
// so the three mutations run in one transaction (all-or-nothing):
//
//   1. mute the three time-based "Needs attention" launch warnings (health
//      checks, follow-ups, leader care) — these surface on Home from groups
//      EXISTING WITHOUT recent activity, so they persist even when every history
//      table is empty; deleting rows never clears them, muting does.
//   2. clear all accumulated history via the Clean Slate wipe (a recoverable
//      snapshot is captured first). An already-empty history is not an error —
//      launch prep is idempotent — so the RPC returns a null snapshot id and
//      clearedRows stays 0.
//   3. purge the per-category history-reset snapshots so no Reset-by-category
//      Revert can re-inject pre-launch rows into the clean launch database.
//
// People, groups, leaders, memberships, settings, care profiles & notes, and the
// audit log are kept (the wipe is history-only by design).
export async function superAdminLaunchPrep(
  _prev: ActionResult<LaunchPrepSuccess> | undefined,
  input: unknown
): Promise<ActionResult<LaunchPrepSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== LAUNCH_PREP_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${LAUNCH_PREP_CONFIRM_PHRASE} exactly to confirm preparing for launch.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  // The RPC mutes + wipes + purges atomically; nothing_to_wipe is handled inside
  // it, so a returned null id means "history was already clear", not a failure.
  const { data: snapshotId, error } = await adminRpc(
    client,
    "super_admin_launch_prep",
    {}
  );
  if (error) return actionFail([mapRpcError(error.message)]);

  // Read the cleared total back from the snapshot row by id (RLS-gated SELECT),
  // never through the uuid return channel. No snapshot ⇒ nothing was wiped.
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
  return actionOk({
    clearedRows,
    mutedKeys: [...LAUNCH_MUTE_FLAG_KEYS],
    snapshotId,
  });
}
