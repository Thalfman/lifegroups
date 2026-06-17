"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import {
  AUDIT_RESET_CONFIRM_PHRASE,
  requireConfirmPhrase,
} from "@/lib/admin/danger-zone";

const REVALIDATE_PATH = "/admin/super-admin";

// Empty payload — the only input is the confirm phrase, validated below.
type AuditResetPayload = Record<string, never>;

function validateAuditResetPayload(
  raw: Record<string, unknown>
): ValidationResult<AuditResetPayload> {
  const error = requireConfirmPhrase(
    raw.confirm,
    AUDIT_RESET_CONFIRM_PHRASE,
    `Type ${AUDIT_RESET_CONFIRM_PHRASE} exactly to confirm resetting the audit log.`
  );
  if (error) return { ok: false, errors: [error] };
  return { ok: true, value: {} };
}

// PRD-SAC6 Feature 3 (#290): standalone archive-then-purge of the audit log.
// Independent of Clean Slate — its own RPC + transaction.
const RESET_AUDIT_LOGS_SPEC: AdminWriteActionSpec<
  AuditResetPayload,
  { id: string }
> = {
  name: "super_admin.reset_audit_logs",
  auth: requireSuperAdminSession,
  keys: ["confirm"],
  validate: validateAuditResetPayload,
  rpc: (client) => adminRpc(client, "super_admin_reset_audit_logs", {}),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The audit log was not reset. Please try again.",
};

export async function superAdminResetAuditLogs(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RESET_AUDIT_LOGS_SPEC, prev, input);
}
