"use server";

import { requireAdminSession } from "@/lib/auth/session";
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

// Bulk import people from pasted (or uploaded) CSV. Parsing is done by the pure
// module (lib/admin/people-import.ts); this action gates on auth_is_admin() via
// requireAdminSession, calls the admin-gated RPC with the parsed rows, and
// surfaces both the created count and any per-row parse errors back to the UI.
//
// Hosted in Settings > System so it is an ordinary ministry-admin capability,
// not a Super-Admin-only one (the Super Admin Console panel reuses this same
// action). The RPC body re-enforces the admin gate; super_admin satisfies it too.

const REVALIDATE_PATHS = ["/admin/settings", "/admin"];

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
  name: "admin.bulk_import_people",
  auth: requireAdminSession,
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
    adminTextRpc(client, "admin_bulk_import_people", {
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
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The import did not complete. Please try again.",
};

export async function adminBulkImportPeople(
  prev: ActionResult<BulkImportPeopleSuccess> | undefined,
  input: unknown
): Promise<ActionResult<BulkImportPeopleSuccess>> {
  return runAdminWriteAction(BULK_IMPORT_PEOPLE_SPEC, prev, input);
}
