"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { resolveSiteOrigin } from "@/lib/shared/site-origin";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import { validateCreateInviteLinkPayload } from "@/lib/admin/validation";
import { adminRpc } from "@/lib/admin/rpc";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/shared/invite-token";
import { startActionLog } from "@/lib/observability/instrument";

export type CreateInviteLinkSuccess = {
  url: string;
  role: "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
  singleUse: boolean;
  expiresAt: string;
};

function readForm(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

// Invoked directly from the "Generate invite link" button. Mints a single
// invitation row (super-admin gated in the RPC) and returns the shareable URL.
// The invited person supplies their own identity + password at /invite/<token>.
export async function superAdminCreateInviteLink(
  input: FormData | Record<string, unknown>
): Promise<ActionResult<CreateInviteLinkSuccess>> {
  const ctx = startActionLog("super_admin.create_invite_link");

  const auth = await requireSuperAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "not_super_admin" });
    return actionFail([auth.error]);
  }

  const v = validateCreateInviteLinkPayload(readForm(input));
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed" });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return actionFail(["The database is not configured on this deployment."]);
  }

  const origin = await resolveSiteOrigin();
  if (!origin) {
    ctx.finish("fail", { error_code: "origin_unresolved" });
    return actionFail([
      "Couldn't determine the site URL for the link. Set NEXT_PUBLIC_SITE_URL and retry.",
    ]);
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);

  const { error } = await adminRpc(client, "super_admin_create_invitation", {
    p_token_hash: tokenHash,
    p_role: v.value.role,
    p_group_id: v.value.group_id ?? null,
    p_single_use: v.value.single_use,
    p_expires_at: v.value.expires_at,
  });
  if (error) {
    ctx.finish("fail", { error_code: "rpc_failed" });
    return actionFail([mapRpcError(error.message)]);
  }

  ctx.finish("ok", { role: v.value.role, single_use: v.value.single_use });
  return actionOk({
    url: `${origin}/invite/${rawToken}`,
    role: v.value.role,
    singleUse: v.value.single_use,
    expiresAt: v.value.expires_at,
  });
}
