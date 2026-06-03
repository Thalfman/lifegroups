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
import { rpcSuperAdminCleanSlateWipe } from "@/lib/admin/rpc";
import {
  CLEAN_SLATE_CONFIRM_PHRASE,
  type CleanSlateWipeSuccess,
} from "@/lib/admin/danger-zone";
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
