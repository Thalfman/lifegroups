"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { resolveSiteOrigin } from "@/lib/shared/site-origin";
import type { ActionResult } from "@/lib/admin/action-result";
import { validateCreateInviteLinkPayload } from "@/lib/admin/validation";
import { adminRpc } from "@/lib/admin/rpc";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/shared/invite-token";
import { readFormPayloadStringified } from "@/lib/shared/form-data";
import { runAdminWriteAction } from "@/lib/admin/run-action";
import type { CreateInviteLinkSuccess } from "@/lib/admin/invite-workflow-view";

// Declared in the view model (lib never imports app; ADR 0039); re-exported
// here so this action module's public contract is unchanged.
export type { CreateInviteLinkSuccess } from "@/lib/admin/invite-workflow-view";

// The link context is minted just before the RPC: only the token's hash is
// written; the raw token exists solely inside the returned URL.
type InviteLinkContext = {
  origin: string;
  rawToken: string;
  tokenHash: string;
};

// Invoked directly from the "Generate invite link" button. Mints a single
// invitation row (super-admin gated in the RPC) and returns the shareable URL.
// The invited person supplies their own identity + password at /invite/<token>.
export async function superAdminCreateInviteLink(
  input: FormData | Record<string, unknown>
): Promise<ActionResult<CreateInviteLinkSuccess>> {
  return runAdminWriteAction(
    {
      name: "super_admin.create_invite_link",
      auth: requireSuperAdminSession,
      read: readFormPayloadStringified,
      validate: validateCreateInviteLinkPayload,
      context: async (): Promise<
        | { ok: true; context: InviteLinkContext }
        | { ok: false; error: string; code: string }
      > => {
        const origin = await resolveSiteOrigin();
        if (!origin) {
          return {
            ok: false,
            code: "origin_unresolved",
            error:
              "Couldn't determine the site URL for the link. Set NEXT_PUBLIC_SITE_URL and retry.",
          };
        }
        const rawToken = generateInviteToken();
        return {
          ok: true,
          context: { origin, rawToken, tokenHash: hashInviteToken(rawToken) },
        };
      },
      rpc: (client, value, ctx) =>
        adminRpc(client, "super_admin_create_invitation", {
          p_token_hash: ctx.tokenHash,
          p_role: value.role,
          p_group_id: value.group_id ?? null,
          p_single_use: value.single_use,
          p_expires_at: value.expires_at,
        }),
      okFields: (value) => ({
        role: value.role,
        single_use: value.single_use,
      }),
      // The link lands on the public /invite/<token> route; no admin surface
      // shows invitation rows, so there is nothing to revalidate.
      revalidate: () => [],
      result: (_id, value, ctx) => ({
        url: `${ctx.origin}/invite/${ctx.rawToken}`,
        role: value.role,
        singleUse: value.single_use,
        expiresAt: value.expires_at,
      }),
      noDataError: "Something went wrong creating the invite link. Try again.",
    },
    undefined,
    input
  );
}
