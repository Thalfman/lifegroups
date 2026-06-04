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
import {
  rpcSuperAdminCleanSlateWipe,
  rpcSuperAdminSetPlatformConfig,
} from "@/lib/admin/rpc";
import {
  LAUNCH_PREP_CONFIRM_PHRASE,
  type LaunchPrepSuccess,
} from "@/lib/admin/danger-zone";
import {
  LAUNCH_MUTE_FLAG_KEYS,
  buildLaunchMuteConfig,
} from "@/lib/admin/feature-flags";
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
// single guarded step. It composes two already-audited super-admin RPCs:
//
//   1. mute the three time-based "Needs attention" launch warnings (health
//      checks, follow-ups, leader care) — these surface on Home from groups
//      EXISTING WITHOUT recent activity, so they persist even when every history
//      table is empty; deleting rows never clears them, muting does. Done first
//      because it is non-destructive and reversible from the Feature Flags card.
//   2. clear all accumulated history via the Clean Slate wipe (a recoverable
//      snapshot is captured before anything is deleted). An already-empty history
//      is not an error here — launch prep is idempotent, so nothing_to_wipe is
//      treated as "already clean", clearedRows = 0.
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

  // 1. Mute the launch warnings (non-destructive, reversible). Bail before the
  //    destructive wipe if this fails, so a failed prep never leaves a wiped DB
  //    with the warnings still showing.
  const { error: flagError } = await rpcSuperAdminSetPlatformConfig(client, {
    p_config: buildLaunchMuteConfig(),
  });
  if (flagError) return actionFail([mapRpcError(flagError.message)]);

  // 2. Clear all accumulated history (recoverable snapshot captured first).
  let clearedRows = 0;
  let snapshotId: string | null = null;
  const { data: wipeId, error: wipeError } =
    await rpcSuperAdminCleanSlateWipe(client);
  if (wipeError) {
    // Already-clean history is the expected case once a ministry is set up but
    // hasn't logged activity yet — not a failure for launch prep.
    if (!wipeError.message.includes("nothing_to_wipe")) {
      return actionFail([mapRpcError(wipeError.message)]);
    }
  } else if (wipeId) {
    snapshotId = wipeId;
    // Read the cleared total back from the snapshot row by id (RLS-gated SELECT),
    // never through the uuid return channel.
    const { data: snapshot } = await client
      .from("clean_slate_snapshots")
      .select("total_rows")
      .eq("id", wipeId)
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
