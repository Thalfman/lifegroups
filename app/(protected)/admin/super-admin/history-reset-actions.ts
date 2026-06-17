"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { isUuid } from "@/lib/shared/uuid";
import { adminRpc } from "@/lib/admin/rpc";
import {
  HISTORY_RESET_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  NOTHING_TO_WIPE_TOKEN,
  requireConfirmPhrase,
  type HistoryResetSuccess,
  type HistoryResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import { isHistoryResetCategory } from "@/lib/admin/history-reset";
import { coerceRowCounts } from "@/lib/supabase/maintenance-reads";
import type { HistoryResetSnapshotsRow } from "@/types/database";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin"] as const;

// Read the category + per-table counts back from a snapshot row by id (RLS-gated
// SELECT) — never through the uuid return channel. Shared by the reset + revert
// success summaries, called from inside each spec's `rpc` (which holds the
// client).
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
// read the counts back from the snapshot row by id for the success summary. An
// already-clear category is an idempotent no-op (NOTHING_TO_WIPE_TOKEN),
// surfaced as a neutral success rather than a red error.
const RESET_HISTORY_CATEGORY_SPEC: AdminWriteActionSpec<
  { category: string },
  HistoryResetSuccess,
  HistoryResetSuccess
> = {
  name: "super_admin.reset_history_category",
  auth: requireSuperAdminSession,
  keys: ["category", "confirm"],
  validate: (raw): ValidationResult<{ category: string }> => {
    const category = typeof raw.category === "string" ? raw.category : "";
    if (!isHistoryResetCategory(category)) {
      return {
        ok: false,
        errors: [
          "That isn't a resettable history category. Refresh the page and try again.",
        ],
      };
    }
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      HISTORY_RESET_CONFIRM_PHRASE,
      `Type ${HISTORY_RESET_CONFIRM_PHRASE} exactly to confirm clearing this category.`
    );
    if (confirmError) return { ok: false, errors: [confirmError] };
    return { ok: true, value: { category } };
  },
  fields: (_actor, value) => ({ history_category: value.category }),
  rpc: async (client, value) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_history_category",
      { p_category: value.category }
    );
    if (error) {
      // Match the raw token, never the mapped sentence, so invalid_category (a
      // tampered/stale form — a genuine failure) and every other error still
      // fail.
      if (error.message === NOTHING_TO_WIPE_TOKEN) {
        return {
          data: {
            category: value.category,
            snapshotId: "",
            totalRows: 0,
            rowCounts: {},
            nothingToClear: true,
          },
          error: null,
        };
      }
      return { data: null, error };
    }
    if (!snapshotId) return { data: null, error: null };
    const summary = await readSnapshotSummary(client, snapshotId);
    return {
      data: {
        category: value.category,
        snapshotId,
        totalRows: summary.totalRows,
        rowCounts: summary.rowCounts,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The reset did not complete. Please try again.",
};

export async function superAdminResetHistoryCategory(
  prev: ActionResult<HistoryResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<HistoryResetSuccess>> {
  return runAdminWriteAction(RESET_HISTORY_CATEGORY_SPEC, prev, input);
}

// PRD-SAC6 follow-up: revert a per-category reset. Gate super_admin, re-verify
// the RESTORE phrase, run the revert RPC bound to the snapshot id the card
// displayed, then read the counts back for the summary.
const RESET_HISTORY_CATEGORY_REVERT_SPEC: AdminWriteActionSpec<
  { snapshotId: string },
  HistoryResetRevertSuccess,
  HistoryResetRevertSuccess
> = {
  name: "super_admin.reset_history_category_revert",
  auth: requireSuperAdminSession,
  keys: ["confirm", "snapshotId"],
  validate: (raw): ValidationResult<{ snapshotId: string }> => {
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring this category.`
    );
    if (confirmError) return { ok: false, errors: [confirmError] };
    const submittedId =
      typeof raw.snapshotId === "string" ? raw.snapshotId.trim() : "";
    if (!isUuid(submittedId)) {
      return {
        ok: false,
        errors: [
          "Couldn't tell which snapshot to restore. Refresh the page and try again.",
        ],
      };
    }
    return { ok: true, value: { snapshotId: submittedId } };
  },
  rpc: async (client, value) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_history_category_revert",
      { p_snapshot_id: value.snapshotId }
    );
    if (error) return { data: null, error };
    if (!snapshotId) return { data: null, error: null };
    const summary = await readSnapshotSummary(client, snapshotId);
    return {
      data: {
        category: summary.category,
        snapshotId,
        totalRows: summary.totalRows,
        rowCounts: summary.rowCounts,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The restore did not complete. Please try again.",
};

export async function superAdminResetHistoryCategoryRevert(
  prev: ActionResult<HistoryResetRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<HistoryResetRevertSuccess>> {
  return runAdminWriteAction(RESET_HISTORY_CATEGORY_REVERT_SPEC, prev, input);
}
