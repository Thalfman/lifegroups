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
  LAUNCH_PREP_CONFIRM_PHRASE,
  type LaunchPrepSuccess,
} from "@/lib/admin/danger-zone";
import { LAUNCH_MUTE_FLAG_KEYS } from "@/lib/admin/feature-flags";
import type { CleanSlateSnapshotsRow } from "@/types/database";

// Read the cleared total back from the snapshot row by id (RLS-gated SELECT),
// never through the uuid return channel. No snapshot ⇒ nothing was wiped.
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
const LAUNCH_PREP_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  LaunchPrepSuccess,
  LaunchPrepSuccess
> = {
  name: "super_admin.launch_prep",
  auth: requireSuperAdminSession,
  keys: ["confirm"],
  validate: (raw): ValidationResult<Record<string, never>> => {
    const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
    if (confirm !== LAUNCH_PREP_CONFIRM_PHRASE) {
      return {
        ok: false,
        errors: [
          `Type ${LAUNCH_PREP_CONFIRM_PHRASE} exactly to confirm preparing for launch.`,
        ],
      };
    }
    return { ok: true, value: {} };
  },
  rpc: async (client) => {
    // The RPC mutes + wipes + purges atomically; nothing_to_wipe is handled
    // inside it, so a returned null id means "history was already clear", not a
    // failure.
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_launch_prep",
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
  revalidate: () => ["/admin/super-admin", "/admin"],
  noDataError: "Launch prep did not complete. Please try again.",
};

export async function superAdminLaunchPrep(
  prev: ActionResult<LaunchPrepSuccess> | undefined,
  input: unknown
): Promise<ActionResult<LaunchPrepSuccess>> {
  return runAdminWriteAction(LAUNCH_PREP_SPEC, prev, input);
}
