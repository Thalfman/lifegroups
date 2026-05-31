"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
} from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  validateSetProfileStatusPayload,
  guardAgainstSelfTarget,
  normalizeUuid,
  isRecord,
  type SetProfileStatusPayload,
} from "@/lib/admin/validation";
import {
  rpcSuperAdminSetProfileStatus,
  rpcSuperAdminLogPasswordReset,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/super-admin";

// Phase SAC.3 (#163): disable / re-enable a profile. Self-target is blocked here
// (defense-in-depth) and again in the RPC; the bootstrap super_admin guard lives
// in the RPC.
const SET_PROFILE_STATUS_SPEC: AdminWriteActionSpec<
  SetProfileStatusPayload,
  { id: string }
> = {
  name: "super_admin.set_profile_status",
  auth: requireSuperAdminSession,
  keys: ["profile_id", "status"],
  validate: validateSetProfileStatusPayload,
  guard: (actor, value) => {
    const self = guardAgainstSelfTarget(actor.id, value.profile_id);
    if (self) return { error: self, code: "self_guard" };
    return null;
  },
  fields: (_actor, value) => ({
    target_profile_id: value.profile_id,
    status: value.status,
  }),
  rpc: (client, value) =>
    rpcSuperAdminSetProfileStatus(client, {
      p_profile_id: value.profile_id,
      p_status: value.status,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The profile status was not updated. Please try again.",
};

export async function superAdminSetProfileStatus(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_PROFILE_STATUS_SPEC, prev, input);
}

// Password reset is not an RPC: it goes through Supabase Auth's
// resetPasswordForEmail (a normal client call, no service role). We still gate
// on super_admin, then log a paired audit row via super_admin_log_password_reset
// so the action stays audited end-to-end.
export type RequestPasswordResetSuccess = {
  email: string;
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

function resetRedirectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const origin = base.replace(/\/$/, "");
  return `${origin}/reset-password`;
}

export async function superAdminRequestPasswordReset(
  _prev: ActionResult<RequestPasswordResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<RequestPasswordResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  const profileId =
    typeof raw.profile_id === "string" && raw.profile_id.length > 0
      ? raw.profile_id
      : null;
  if (email.length === 0) {
    return actionFail(["An email address is required to send a reset link."]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  try {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirectUrl(),
    });
    if (error) {
      return actionFail([
        "We couldn't send the reset email. Check the address and try again.",
      ]);
    }
  } catch {
    return actionFail([
      "We couldn't send the reset email. Try again in a moment.",
    ]);
  }

  // Best-effort audit. The email already went out; a logging failure should not
  // be reported to the operator as a reset failure.
  if (profileId) {
    await rpcSuperAdminLogPasswordReset(client, {
      p_profile_id: normalizeUuid(profileId),
    });
  }

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ email });
}
