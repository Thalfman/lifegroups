"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { rpcSuperAdminSetPlatformConfig } from "@/lib/admin/rpc";
import {
  getEditableCopyDefinition,
  EDITABLE_COPY_MAX_LENGTH,
} from "@/lib/admin/editable-copy";
import { isRecord } from "@/lib/admin/validation";

// Phase SAC.2 (#162): edit one piece of configurable copy from the Super Admin
// Console. The RPC deep-merges the single key into the stored editable_copy
// object. An empty value is allowed: it clears the override back to the built-in
// placeholder (resolveCopy treats blank as unset).
type SetCopyPayload = {
  key: string;
  value: string;
};

function validateSetCopy(
  raw: Record<string, unknown>
): ValidationResult<SetCopyPayload> {
  const errors: string[] = [];
  if (!isRecord(raw))
    return { ok: false, errors: ["payload must be an object"] };
  const key = typeof raw.key === "string" ? raw.key : "";
  const value = typeof raw.value === "string" ? raw.value : "";
  if (!getEditableCopyDefinition(key)) {
    errors.push("That copy key isn't a known editable string.");
  }
  if (value.length > EDITABLE_COPY_MAX_LENGTH) {
    errors.push(
      `Copy must be ${EDITABLE_COPY_MAX_LENGTH} characters or fewer.`
    );
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { key, value } };
}

const SET_COPY_SPEC: AdminWriteActionSpec<SetCopyPayload, { id: string }> = {
  name: "super_admin.set_copy",
  auth: requireSuperAdminSession,
  keys: ["key", "value"],
  validate: validateSetCopy,
  fields: (_actor, value) => ({ copy_key: value.key }),
  rpc: (client, value) =>
    rpcSuperAdminSetPlatformConfig(client, {
      p_config: { editable_copy: { [value.key]: value.value } },
    }),
  revalidate: () => ["/admin/super-admin"],
  noDataError: "The copy was not saved. Please try again.",
};

export async function superAdminSetCopy(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_COPY_SPEC, prev, input);
}
