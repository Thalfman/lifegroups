"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import {
  RESET_ALL_CONFIRM_PHRASE,
  requireConfirmPhrase,
  type ResetAllSuccess,
} from "@/lib/admin/danger-zone";
import { LAUNCH_MUTE_FLAG_KEYS } from "@/lib/admin/feature-flags";
import type { CleanSlateSnapshotsRow } from "@/types/database";

// Read the cleared total back from the history snapshot row by id (RLS-gated
// SELECT), never through the uuid return channel. No snapshot ⇒ nothing wiped.
async function readClearedRows(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  snapshotId: string | null
): Promise<number> {
  if (!client || !snapshotId) return 0;
  const { data: snapshot } = await client
    .from("clean_slate_snapshots")
    .select("total_rows")
    .eq("id", snapshotId)
    .maybeSingle<Pick<CleanSlateSnapshotsRow, "total_rows">>();
  const total = Number(snapshot?.total_rows);
  return Number.isFinite(total) ? total : 0;
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
// from its own Danger-Zone card. The RPC is idempotent (never raises
// nothing_to_wipe), so a returned null id just means "history was already
// clear", not a failure — `rpc` reports a non-null success shape either way.
const RESET_ALL_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  ResetAllSuccess,
  ResetAllSuccess
> = {
  name: "super_admin.reset_all",
  auth: requireSuperAdminSession,
  keys: ["confirm"],
  validate: (raw): ValidationResult<Record<string, never>> => {
    const error = requireConfirmPhrase(
      raw.confirm,
      RESET_ALL_CONFIRM_PHRASE,
      `Type ${RESET_ALL_CONFIRM_PHRASE} exactly to confirm resetting everything.`
    );
    if (error) return { ok: false, errors: [error] };
    return { ok: true, value: {} };
  },
  rpc: async (client) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_all",
      {}
    );
    if (error) return { data: null, error };
    const clearedRows = await readClearedRows(client, snapshotId);
    return {
      data: {
        clearedRows,
        mutedKeys: [...LAUNCH_MUTE_FLAG_KEYS],
        snapshotId: snapshotId ?? null,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => [
    "/admin/super-admin",
    "/admin",
    "/admin/shepherd-care",
    "/admin/group-health",
  ],
  noDataError: "The reset did not complete. Please try again.",
};

export async function superAdminResetAll(
  prev: ActionResult<ResetAllSuccess> | undefined,
  input: unknown
): Promise<ActionResult<ResetAllSuccess>> {
  return runAdminWriteAction(RESET_ALL_SPEC, prev, input);
}
