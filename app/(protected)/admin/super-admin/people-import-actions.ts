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
  parsePeopleImport,
  type PersonImportRowError,
} from "@/lib/admin/people-import";
import { adminTextRpc } from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/super-admin";

// Phase SAC.5 (#165): bulk import people from pasted CSV. Parsing is done by the
// pure module (lib/admin/people-import.ts); this action gates on super_admin,
// calls the RPC with the parsed rows, and surfaces both the created count and
// any per-row parse errors back to the UI.
export type BulkImportPeopleSuccess = {
  createdCount: number;
  leaderCount: number;
  memberCount: number;
  perRowErrors: PersonImportRowError[];
};

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

export async function superAdminBulkImportPeople(
  _prev: ActionResult<BulkImportPeopleSuccess> | undefined,
  input: unknown
): Promise<ActionResult<BulkImportPeopleSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const payload = typeof raw.payload === "string" ? raw.payload : "";

  const { rowsToCreate, perRowErrors } = parsePeopleImport(payload);

  if (rowsToCreate.length === 0) {
    // Nothing parseable. Surface the per-row errors (or a generic message).
    const lines =
      perRowErrors.length > 0
        ? perRowErrors.map((e) => `Line ${e.line}: ${e.errors.join(", ")}`)
        : ["No valid rows to import. Check the header row and try again."];
    return actionFail(lines);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await adminTextRpc(
    client,
    "super_admin_bulk_import_people",
    {
      p_rows: rowsToCreate,
    }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) {
    return actionFail(["The import did not complete. Please try again."]);
  }

  const createdCount = Number.parseInt(data, 10);
  const leaderCount = rowsToCreate.filter((r) => r.role === "leader").length;
  const memberCount = rowsToCreate.filter((r) => r.role === "member").length;

  revalidatePath(REVALIDATE_PATH);
  return actionOk({
    createdCount: Number.isFinite(createdCount)
      ? createdCount
      : rowsToCreate.length,
    leaderCount,
    memberCount,
    perRowErrors,
  });
}
