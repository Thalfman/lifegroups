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
import { isUuid } from "@/lib/shared/uuid";
import {
  rpcSuperAdminResetHistoryCategory,
  rpcSuperAdminResetHistoryCategoryRevert,
} from "@/lib/admin/rpc";
import {
  HISTORY_RESET_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  NOTHING_TO_WIPE_TOKEN,
  type HistoryResetSuccess,
  type HistoryResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import { isHistoryResetCategory } from "@/lib/admin/history-reset";
import { coerceRowCounts } from "@/lib/supabase/maintenance-reads";
import type { HistoryResetSnapshotsRow } from "@/types/database";

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

// Read the category + per-table counts back from a snapshot row by id (RLS-gated
// SELECT) — never through the uuid return channel. Shared by the reset + revert
// success summaries.
async function readSnapshotSummary(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  snapshotId: string
): Promise<{
  category: string;
  totalRows: number;
  rowCounts: Record<string, number>;
}> {
  const empty = { category: "", totalRows: 0, rowCounts: {} };
  if (!client) return empty;
  const { data: snapshot } = await client
    .from("history_reset_snapshots")
    .select("category, total_rows, row_counts")
    .eq("id", snapshotId)
    .maybeSingle<
      Pick<HistoryResetSnapshotsRow, "category" | "total_rows" | "row_counts">
    >();
  if (!snapshot) return empty;
  const total = Number(snapshot.total_rows);
  return {
    category: String(snapshot.category),
    totalRows: Number.isFinite(total) ? total : 0,
    rowCounts: coerceRowCounts(snapshot.row_counts),
  };
}

// PRD-SAC6 follow-up: clear one category of history. Gate super_admin, validate
// the category + the type-to-confirm phrase, run the snapshot+delete RPC, then
// read the counts back from the snapshot row by id for the success summary.
export async function superAdminResetHistoryCategory(
  _prev: ActionResult<HistoryResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<HistoryResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const category = typeof raw.category === "string" ? raw.category : "";
  if (!isHistoryResetCategory(category)) {
    return actionFail([
      "That isn't a resettable history category. Refresh the page and try again.",
    ]);
  }

  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== HISTORY_RESET_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${HISTORY_RESET_CONFIRM_PHRASE} exactly to confirm clearing this category.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } = await rpcSuperAdminResetHistoryCategory(
    client,
    { p_category: category }
  );
  if (error) {
    // An already-clear category is an idempotent no-op, not a failure: surface
    // it as a neutral success so a reset with nothing to clear doesn't read as a
    // red error. Match the raw token, never the mapped sentence, so invalid_category
    // (a tampered/stale form — a genuine failure) and every other error still fail.
    if (error.message === NOTHING_TO_WIPE_TOKEN) {
      revalidatePath(REVALIDATE_PATH);
      revalidatePath("/admin");
      return actionOk({
        category,
        snapshotId: "",
        totalRows: 0,
        rowCounts: {},
        nothingToClear: true,
      });
    }
    return actionFail([mapRpcError(error.message)]);
  }
  if (!snapshotId) {
    return actionFail(["The reset did not complete. Please try again."]);
  }

  const summary = await readSnapshotSummary(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({
    category,
    snapshotId,
    totalRows: summary.totalRows,
    rowCounts: summary.rowCounts,
  });
}

// PRD-SAC6 follow-up: revert a per-category reset. Gate super_admin, re-verify the
// RESTORE phrase, run the revert RPC bound to the snapshot id the card displayed,
// then read the counts back for the summary.
export async function superAdminResetHistoryCategoryRevert(
  _prev: ActionResult<HistoryResetRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<HistoryResetRevertSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== CLEAN_SLATE_RESTORE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring this category.`,
    ]);
  }

  const submittedId =
    typeof raw.snapshotId === "string" ? raw.snapshotId.trim() : "";
  if (!isUuid(submittedId)) {
    return actionFail([
      "Couldn't tell which snapshot to restore. Refresh the page and try again.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } =
    await rpcSuperAdminResetHistoryCategoryRevert(client, {
      p_snapshot_id: submittedId,
    });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The restore did not complete. Please try again."]);
  }

  const summary = await readSnapshotSummary(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({
    category: summary.category,
    snapshotId,
    totalRows: summary.totalRows,
    rowCounts: summary.rowCounts,
  });
}
