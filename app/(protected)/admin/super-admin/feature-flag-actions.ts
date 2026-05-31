"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { rpcSuperAdminSetPlatformConfig } from "@/lib/admin/rpc";
import { getFeatureFlagDefinition } from "@/lib/admin/feature-flags";
import { isRecord } from "@/lib/admin/validation";

// Phase SAC.2 (#161): toggle a feature flag from the Super Admin Console. Routed
// through the shared admin write runner with the super-admin gate; the RPC
// deep-merges the single flag's `enabled` into the stored feature_flags object
// and writes a paired audit row.
//
// The toggle only ever sets `enabled`. It never sets `verified: true`: marking a
// frozen surface re-verified is separate per-surface work, so an on-but-
// unverified frozen flag stays resolved-off until that verification lands.
type SetFeatureFlagPayload = {
  key: string;
  enabled: boolean;
};

function readBool(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return t === "true" || t === "on" || t === "1";
  }
  return false;
}

function validateSetFeatureFlag(
  raw: Record<string, unknown>
): ValidationResult<SetFeatureFlagPayload> {
  if (!isRecord(raw))
    return { ok: false, errors: ["payload must be an object"] };
  const key = typeof raw.key === "string" ? raw.key : "";
  if (!getFeatureFlagDefinition(key)) {
    return { ok: false, errors: ["That feature flag isn't a known flag."] };
  }
  return { ok: true, value: { key, enabled: readBool(raw.enabled) } };
}

const SET_FEATURE_FLAG_SPEC: AdminWriteActionSpec<
  SetFeatureFlagPayload,
  { id: string }
> = {
  name: "super_admin.set_feature_flag",
  auth: requireSuperAdminSession,
  keys: ["key", "enabled"],
  validate: validateSetFeatureFlag,
  fields: (_actor, value) => ({ flag_key: value.key, enabled: value.enabled }),
  rpc: (client, value) =>
    rpcSuperAdminSetPlatformConfig(client, {
      p_config: {
        feature_flags: { [value.key]: { enabled: value.enabled } },
      },
    }),
  revalidate: () => ["/admin/super-admin"],
  noDataError: "The feature flag was not saved. Please try again.",
};

export async function superAdminSetFeatureFlag(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_FEATURE_FLAG_SPEC, prev, input);
}
