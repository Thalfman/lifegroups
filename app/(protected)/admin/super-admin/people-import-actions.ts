"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
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

type ParsedImport = ReturnType<typeof parsePeopleImport>;

// The bulk-import RPC returns the created COUNT as text; `result` parses it and
// folds in the per-row counts/errors the validator already computed.
const BULK_IMPORT_PEOPLE_SPEC: AdminWriteActionSpec<
  ParsedImport,
  BulkImportPeopleSuccess
> = {
  name: "super_admin.bulk_import_people",
  auth: requireSuperAdminSession,
  keys: ["payload"],
  validate: (raw): ValidationResult<ParsedImport> => {
    const payload = typeof raw.payload === "string" ? raw.payload : "";
    const parsed = parsePeopleImport(payload);
    if (parsed.rowsToCreate.length === 0) {
      // Nothing parseable. Surface the per-row errors (or a generic message).
      const lines =
        parsed.perRowErrors.length > 0
          ? parsed.perRowErrors.map(
              (e) => `Line ${e.line}: ${e.errors.join(", ")}`
            )
          : ["No valid rows to import. Check the header row and try again."];
      return { ok: false, errors: lines };
    }
    return { ok: true, value: parsed };
  },
  okFields: (value) => ({ rows_to_create: value.rowsToCreate.length }),
  rpc: (client, value) =>
    adminTextRpc(client, "super_admin_bulk_import_people", {
      p_rows: value.rowsToCreate,
    }),
  result: (data, value) => {
    const createdCount = Number.parseInt(data, 10);
    const leaderCount = value.rowsToCreate.filter(
      (r) => r.role === "leader"
    ).length;
    const memberCount = value.rowsToCreate.filter(
      (r) => r.role === "member"
    ).length;
    return {
      createdCount: Number.isFinite(createdCount)
        ? createdCount
        : value.rowsToCreate.length,
      leaderCount,
      memberCount,
      perRowErrors: value.perRowErrors,
    };
  },
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The import did not complete. Please try again.",
};

export async function superAdminBulkImportPeople(
  prev: ActionResult<BulkImportPeopleSuccess> | undefined,
  input: unknown
): Promise<ActionResult<BulkImportPeopleSuccess>> {
  return runAdminWriteAction(BULK_IMPORT_PEOPLE_SPEC, prev, input);
}
