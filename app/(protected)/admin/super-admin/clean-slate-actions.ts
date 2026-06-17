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
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { isRecord } from "@/lib/admin/validation";
import { isUuid } from "@/lib/shared/uuid";
import { adminRpc } from "@/lib/admin/rpc";
import {
  CLEAN_SLATE_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  NOTHING_TO_WIPE_TOKEN,
  requireConfirmPhrase,
  type CleanSlateWipeSuccess,
  type CleanSlateRevertSuccess,
  type CleanSlateImportSuccess,
} from "@/lib/admin/danger-zone";
import {
  CLEAN_SLATE_TABLES,
  coerceRowCounts,
} from "@/lib/supabase/maintenance-reads";
import type { CleanSlateSnapshotsRow } from "@/types/database";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin"] as const;

// Read the per-table counts back from a snapshot row by id (RLS-gated SELECT) —
// never through the uuid return channel. Shared by the wipe + revert success
// summaries, called from inside each spec's `rpc` (which holds the client).
async function readSnapshotCounts(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  snapshotId: string
): Promise<{ totalRows: number; rowCounts: Record<string, number> }> {
  if (!client) return { totalRows: 0, rowCounts: {} };
  const { data: snapshot } = await client
    .from("clean_slate_snapshots")
    .select("total_rows, row_counts")
    .eq("id", snapshotId)
    .maybeSingle<Pick<CleanSlateSnapshotsRow, "total_rows" | "row_counts">>();
  if (!snapshot) return { totalRows: 0, rowCounts: {} };
  const total = Number(snapshot.total_rows);
  return {
    totalRows: Number.isFinite(total) ? total : 0,
    rowCounts: coerceRowCounts(snapshot.row_counts),
  };
}

// PRD-SAC6 Feature 1 (#288): history-only Clean Slate wipe. Gate super_admin,
// re-verify the type-to-confirm phrase, run the snapshot+wipe RPC, then read the
// counts back from the snapshot row by id (never through the uuid channel) for
// the success summary. `D` is the parsed success shape so the read-back and the
// idempotent nothing_to_wipe no-op both resolve inside `rpc`.
const CLEAN_SLATE_WIPE_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  CleanSlateWipeSuccess,
  CleanSlateWipeSuccess
> = {
  name: "super_admin.clean_slate_wipe",
  auth: requireSuperAdminSession,
  keys: ["confirm"],
  validate: (raw): ValidationResult<Record<string, never>> => {
    const error = requireConfirmPhrase(
      raw.confirm,
      CLEAN_SLATE_CONFIRM_PHRASE,
      `Type ${CLEAN_SLATE_CONFIRM_PHRASE} exactly to confirm clearing all history.`
    );
    if (error) return { ok: false, errors: [error] };
    return { ok: true, value: {} };
  },
  rpc: async (client) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_clean_slate_wipe",
      {}
    );
    if (error) {
      // An already-clear history is an idempotent no-op, not a failure: surface
      // it as a neutral success so a reset with nothing to clear doesn't read as
      // a red error. Match the raw token, never the mapped sentence, so every
      // other error (incl. a genuine failure) still fails. This can be reached
      // from the race window where the impact preview was non-empty but history
      // was cleared (another tab / a prior action) before this submit landed.
      if (error.message === NOTHING_TO_WIPE_TOKEN) {
        return {
          data: {
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
    const { totalRows, rowCounts } = await readSnapshotCounts(
      client,
      snapshotId
    );
    return { data: { snapshotId, totalRows, rowCounts }, error: null };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The wipe did not complete. Please try again.",
};

export async function superAdminCleanSlateWipe(
  prev: ActionResult<CleanSlateWipeSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateWipeSuccess>> {
  return runAdminWriteAction(CLEAN_SLATE_WIPE_SPEC, prev, input);
}

// PRD-SAC6 Feature 1 (#293): in-DB Clean Slate revert. Gate super_admin,
// re-verify the RESTORE phrase, run the revert RPC bound to the snapshot id the
// form displayed (so a stale tab fails with missing_snapshot rather than
// restoring a different snapshot), then read the counts back for the summary.
//
// The card binds the revert to the snapshot it displayed via a hidden field.
// Require a valid id and pass exactly that — never fall back to "latest
// un-restored", or a stale/tampered submission with no id would silently switch
// target-selection mode and restore a different snapshot than the operator
// confirmed. A stale id whose snapshot is gone fails in the RPC with
// missing_snapshot, which is the intended outcome.
const CLEAN_SLATE_REVERT_SPEC: AdminWriteActionSpec<
  { snapshotId: string },
  CleanSlateRevertSuccess,
  CleanSlateRevertSuccess
> = {
  name: "super_admin.clean_slate_revert",
  auth: requireSuperAdminSession,
  keys: ["confirm", "snapshotId"],
  validate: (raw): ValidationResult<{ snapshotId: string }> => {
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring the snapshot.`
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
      "super_admin_clean_slate_revert",
      { p_snapshot_id: value.snapshotId }
    );
    if (error) return { data: null, error };
    if (!snapshotId) return { data: null, error: null };
    const { totalRows, rowCounts } = await readSnapshotCounts(
      client,
      snapshotId
    );
    return { data: { snapshotId, totalRows, rowCounts }, error: null };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The restore did not complete. Please try again.",
};

export async function superAdminCleanSlateRevert(
  prev: ActionResult<CleanSlateRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateRevertSuccess>> {
  return runAdminWriteAction(CLEAN_SLATE_REVERT_SPEC, prev, input);
}

// Count the per-table rows in a parsed export payload, for the import success
// summary. The RPC does authoritative validation; this only runs after a
// successful import, so the arrays are known-good.
function countPayloadRows(payload: Record<string, unknown>): {
  totalRows: number;
  rowCounts: Record<string, number>;
} {
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of CLEAN_SLATE_TABLES) {
    const arr = payload[table];
    const n = Array.isArray(arr) ? arr.length : 0;
    rowCounts[table] = n;
    totalRows += n;
  }
  return { totalRows, rowCounts };
}

// PRD-SAC6 Feature 1 (#294): import a Clean Slate snapshot from an uploaded JSON
// file. Gate super_admin, re-verify the RESTORE phrase, read the uploaded File
// from FormData, parse it in a try/catch (friendly fail on bad JSON) BEFORE the
// RPC, then run the import RPC (which does the authoritative schema validation +
// restore). Counts for the summary are taken from the parsed payload.
//
// Stays hand-rolled (not a Write Action Runner spec): the friendly bad-JSON
// parse is async file I/O that can't live in the runner's synchronous
// validator, and its parse-error message isn't an RPC error token mapRpcError
// could translate. Tracked as a runner-seam holdout.
export async function superAdminCleanSlateImport(
  _prev: ActionResult<CleanSlateImportSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateImportSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  if (!(input instanceof FormData)) {
    return actionFail(["No file was uploaded. Choose a snapshot file."]);
  }

  const confirmError = requireConfirmPhrase(
    input.get("confirm"),
    CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
    `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm importing the snapshot.`
  );
  if (confirmError) {
    return actionFail([confirmError]);
  }

  const file = input.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return actionFail(["No file was uploaded. Choose a snapshot file."]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return actionFail([
      "That file isn't valid JSON. Use a file exported by Clean Slate Export.",
    ]);
  }
  if (!isRecord(parsed)) {
    return actionFail([
      "That file isn't a snapshot. Use a file exported by Clean Slate Export.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await adminRpc(
    client,
    "super_admin_clean_slate_import",
    {
      p_payload: parsed,
    }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) {
    return actionFail(["The import did not complete. Please try again."]);
  }

  const { totalRows, rowCounts } = countPayloadRows(parsed);

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return actionOk({ totalRows, rowCounts });
}
