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
  rpcSuperAdminCleanSlateRevert,
  rpcSuperAdminCleanSlateImport,
} from "@/lib/admin/rpc";
import {
  CLEAN_SLATE_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type CleanSlateWipeSuccess,
  type CleanSlateRevertSuccess,
  type CleanSlateImportSuccess,
} from "@/lib/admin/danger-zone";
import { CLEAN_SLATE_TABLES } from "@/lib/supabase/maintenance-reads";
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

function coerceCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

// PRD-SAC6 Feature 1 (#288): history-only Clean Slate wipe. Gate super_admin,
// re-verify the type-to-confirm phrase, run the snapshot+wipe RPC, then read the
// counts back from the snapshot row by id (never through the uuid channel) for
// the success summary.
export async function superAdminCleanSlateWipe(
  _prev: ActionResult<CleanSlateWipeSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateWipeSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== CLEAN_SLATE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${CLEAN_SLATE_CONFIRM_PHRASE} exactly to confirm clearing all history.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } = await rpcSuperAdminCleanSlateWipe(client);
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The wipe did not complete. Please try again."]);
  }

  // Read the per-table counts back from the snapshot the RPC just wrote.
  let totalRows = 0;
  let rowCounts: Record<string, number> = {};
  const { data: snapshot } = await client
    .from("clean_slate_snapshots")
    .select("total_rows, row_counts")
    .eq("id", snapshotId)
    .maybeSingle<Pick<CleanSlateSnapshotsRow, "total_rows" | "row_counts">>();
  if (snapshot) {
    const total = Number(snapshot.total_rows);
    if (Number.isFinite(total)) totalRows = total;
    rowCounts = coerceCounts(snapshot.row_counts);
  }

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({ snapshotId, totalRows, rowCounts });
}

// Read the per-table counts back from a snapshot row by id (RLS-gated SELECT) —
// the same trust-boundary read the wipe success summary uses.
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
    rowCounts: coerceCounts(snapshot.row_counts),
  };
}

// PRD-SAC6 Feature 1 (#293): in-DB Clean Slate revert. Gate super_admin,
// re-verify the RESTORE phrase, run the revert RPC (restores the latest
// un-restored snapshot), then read the counts back from the restored snapshot
// row for the success summary.
export async function superAdminCleanSlateRevert(
  _prev: ActionResult<CleanSlateRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateRevertSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== CLEAN_SLATE_RESTORE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring the snapshot.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  // Latest un-restored snapshot (p_snapshot_id null lets the RPC resolve it).
  const { data: snapshotId, error } = await rpcSuperAdminCleanSlateRevert(
    client,
    { p_snapshot_id: null }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The restore did not complete. Please try again."]);
  }

  const { totalRows, rowCounts } = await readSnapshotCounts(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({ snapshotId, totalRows, rowCounts });
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
export async function superAdminCleanSlateImport(
  _prev: ActionResult<CleanSlateImportSuccess> | undefined,
  input: unknown
): Promise<ActionResult<CleanSlateImportSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  if (!(input instanceof FormData)) {
    return actionFail(["No file was uploaded. Choose a snapshot file."]);
  }

  const confirmRaw = input.get("confirm");
  const confirm = typeof confirmRaw === "string" ? confirmRaw.trim() : "";
  if (confirm !== CLEAN_SLATE_RESTORE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm importing the snapshot.`,
    ]);
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

  const { data, error } = await rpcSuperAdminCleanSlateImport(client, {
    p_payload: parsed,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) {
    return actionFail(["The import did not complete. Please try again."]);
  }

  const { totalRows, rowCounts } = countPayloadRows(parsed);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({ totalRows, rowCounts });
}
