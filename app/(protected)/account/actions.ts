"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { validateDeletionReason } from "@/lib/account/validation";
import { rpcRequestOwnAccountDeletion } from "@/lib/account/rpc";
import {
  PW_SETUP_COOKIE,
  passwordSetupCookieClearOptions,
} from "@/lib/auth/password-setup";
import {
  LANDING_HINT_COOKIE,
  landingHintCookieClearOptions,
} from "@/lib/auth/landing-hint";

export type DeletionRequestState = { error?: string };

// Generic copy: never echo Supabase error text to the browser. The real cause
// is in the structured log.
const GENERIC_FAILED = "Couldn't submit your request. Please try again.";

// Self-service account-deletion request (#563). A signed-in user requests
// deletion of their own account: the RPC archives their profile (revoking
// access) and records a pending request for the Super-Admin danger zone. We
// then end the live session and route to the public confirmation page.
export async function requestAccountDeletionAction(
  _prev: DeletionRequestState,
  formData: FormData
): Promise<DeletionRequestState> {
  const ctx = startActionLog("account.request_deletion");

  // Require an explicit confirmation so a stray submit can't archive an account.
  if (formData.get("confirm") !== "on") {
    ctx.finish("fail", { error_code: "not_confirmed" });
    return {
      error: "Please confirm you understand before requesting deletion.",
    };
  }

  const reason = validateDeletionReason(formData.get("reason"));
  if (!reason.ok) {
    ctx.finish("fail", { error_code: "validation_failed" });
    return { error: reason.error };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return {
      error: "Account deletion isn't configured on this deployment.",
    };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    ctx.finish("denied", { error_code: "no_session" });
    redirect("/login");
  }

  const rpc = await rpcRequestOwnAccountDeletion(client, {
    p_reason: reason.value,
  });

  if (rpc.error) {
    const token = rpc.error.message;
    if (token.includes("forbidden_target")) {
      ctx.finish("denied", { error_code: "forbidden_target" });
      return {
        error:
          "Super Admins manage account removal in the Super-Admin danger zone.",
      };
    }
    // An existing pending request means the job is already done — treat it like
    // success: end the session and show the confirmation.
    if (!token.includes("deletion_already_requested")) {
      ctx.finish("fail", { error_code: "request_deletion_failed" });
      return { error: GENERIC_FAILED };
    }
    ctx.finish("ok", { error_code: "already_requested" });
  } else {
    ctx.finish("ok");
  }

  // Revoke the live session immediately too: the profile is now archived, but
  // signing out ends the cookie session so the app is inaccessible at once.
  // `local` scope mirrors logoutAction — other devices' sessions stay until the
  // archived profile fails their next role guard.
  await client.auth.signOut({ scope: "local" });
  const cookieStore = await cookies();
  cookieStore.set(PW_SETUP_COOKIE, "", passwordSetupCookieClearOptions());
  cookieStore.set(LANDING_HINT_COOKIE, "", landingHintCookieClearOptions());

  redirect("/account-deletion?status=requested");
}
