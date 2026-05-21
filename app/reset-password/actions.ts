"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";

export type ResetPasswordState = { error?: string };

const MIN_PASSWORD_LENGTH = 8;

// Generic copy mirrors the forgot-password posture: never echo Supabase's
// auth error text to the browser. Real cause is in the structured log.
const GENERIC_UPDATE_FAILED =
  "Couldn't update your password. Try again.";

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const ctx = startActionLog("auth.reset_password");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) {
    ctx.finish("fail", { error_code: "validation_failed", reason: "missing" });
    return { error: "Enter your new password twice." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.finish("fail", { error_code: "validation_failed", reason: "too_short" });
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    ctx.finish("fail", { error_code: "validation_failed", reason: "mismatch" });
    return { error: "Passwords don't match." };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return { error: "Password reset is not configured on this deployment." };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    ctx.finish("denied", { error_code: "recovery_session_expired" });
    return {
      error:
        "Your reset link has expired or was already used. Request a new one from Forgot password.",
    };
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    ctx.finish("fail", {
      error_code: error.code ?? "update_user_failed",
      error_message: error.message,
    });
    return { error: GENERIC_UPDATE_FAILED };
  }

  // Sign out the recovery session so the next page load lands on /login
  // clean — the user can sign in fresh with the new password.
  await client.auth.signOut({ scope: "local" });

  ctx.finish("ok");
  redirect("/login?reset=ok");
}
