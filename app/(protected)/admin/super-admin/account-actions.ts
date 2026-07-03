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
  isRecord,
  type SetProfileStatusPayload,
} from "@/lib/admin/validation";
import { adminRpc } from "@/lib/admin/rpc";
import { resolveSiteOrigin } from "@/lib/shared/site-origin";
import { isUuid } from "@/lib/shared/uuid";
import { startActionLog } from "@/lib/observability/instrument";

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
    adminRpc(client, "super_admin_set_profile_status", {
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

export async function superAdminRequestPasswordReset(
  _prev: ActionResult<RequestPasswordResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<RequestPasswordResetSuccess>> {
  const ctx = startActionLog("super_admin.request_password_reset");

  const auth = await requireSuperAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "not_super_admin" });
    return actionFail([auth.error]);
  }

  const raw = readForm(input);
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (email.length === 0) {
    ctx.finish("fail", { error_code: "validation_failed" });
    return actionFail(["An email address is required to send a reset link."]);
  }
  // The reset form always posts the target's profile_id; anything else is a
  // malformed request. Reject it BEFORE the email goes out — never send a
  // reset that can't be audited.
  if (!isUuid(raw.profile_id)) {
    ctx.finish("fail", { error_code: "validation_failed" });
    return actionFail(["The reset request was malformed. Please try again."]);
  }
  const profileId = raw.profile_id.toLowerCase();

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return actionFail(["Database is not configured."]);
  }

  // Resolve the reset-link target the same way the invite + forgot-password
  // flows do (lib/shared/site-origin). Prefers NEXT_PUBLIC_SITE_URL / SITE_URL,
  // falling back to the request's forwarded host. A null origin (nothing
  // resolvable) omits redirectTo so Supabase uses its configured Site URL,
  // rather than emitting a relative "/reset-password" the old helper produced.
  const origin = await resolveSiteOrigin();
  const redirectTo = origin ? `${origin}/reset-password` : undefined;

  try {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      ctx.finish("fail", { error_code: "reset_email_failed" });
      return actionFail([
        "We couldn't send the reset email. Check the address and try again.",
      ]);
    }
  } catch {
    ctx.finish("fail", { error_code: "reset_email_failed" });
    return actionFail([
      "We couldn't send the reset email. Try again in a moment.",
    ]);
  }

  // Best-effort audit. The email already went out, so a logging failure is not
  // reported to the operator as a reset failure — but it MUST NOT be silent:
  // finish("fail") makes the missing audit row visible in the log drain.
  // adminRpc's uuid channel already trust-boundary-reads the result, so a
  // null data means the RPC did not confirm the audit row.
  const { data, error } = await adminRpc(
    client,
    "super_admin_log_password_reset",
    { p_profile_id: profileId }
  );
  if (error || data === null) {
    ctx.finish("fail", {
      error_code: "audit_rpc_failed",
      target_profile_id: profileId,
    });
  } else {
    ctx.finish("ok", { target_profile_id: profileId });
  }

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ email });
}
