"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import {
  PW_SETUP_COOKIE,
  passwordSetupCookieClearOptions,
} from "@/lib/auth/password-setup";
import { readOwnNameState } from "@/lib/account/own-name";
import { validateOwnFullName } from "@/lib/account/validation";
import { rpcSetOwnFullName } from "@/lib/account/rpc";

export type ResetPasswordState = { error?: string };

const MIN_PASSWORD_LENGTH = 8;

// Generic copy mirrors the forgot-password posture: never echo Supabase's
// auth error text to the browser. Real cause is in the structured log.
const GENERIC_UPDATE_FAILED = "Couldn't update your password. Try again.";
const GENERIC_NAME_FAILED = "Couldn't save your name. Try again.";

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const ctx = startActionLog("auth.reset_password");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) {
    ctx.finish("fail", { error_code: "validation_failed", reason: "missing" });
    return { error: "Enter your new password twice." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.finish("fail", {
      error_code: "validation_failed",
      reason: "too_short",
    });
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
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

  // Choose-your-name step (ADR 0025). Pendingness is re-derived server-side —
  // never trusted from the client — and the name is saved BEFORE the password
  // so a failed name write is fully retryable (the password is untouched;
  // retrying a committed password change would hit GoTrue's same-password
  // rejection). If the user stops after this write, the lg_pw_setup cookie
  // still pins the session here, so nothing is stranded.
  const nameState = await readOwnNameState(client, user.id);
  if (nameState?.pending) {
    const rawName = formData.get("full_name");
    // A null field means the form rendered without the name input (the page's
    // own name read degraded). Don't block password setup on it — the
    // /welcome gate collects the name after sign-in instead.
    if (rawName !== null) {
      const v = validateOwnFullName(String(rawName));
      if (!v.ok) {
        ctx.finish("fail", {
          error_code: "validation_failed",
          reason: "full_name",
        });
        return { error: v.error };
      }
      const rpc = await rpcSetOwnFullName(client, { p_full_name: v.value });
      // name_not_pending = a double submit already saved it; carry on.
      if (rpc.error && !rpc.error.message.includes("name_not_pending")) {
        ctx.finish("fail", { error_code: "set_own_full_name_failed" });
        return { error: GENERIC_NAME_FAILED };
      }
    }
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    // Log only the stable error.code, not the raw message. Supabase auth
    // error messages can occasionally include user-supplied input or other
    // sensitive context; the code alone is enough to triage by category.
    ctx.finish("fail", {
      error_code: error.code ?? "update_user_failed",
    });
    return { error: GENERIC_UPDATE_FAILED };
  }

  // Password is saved — release the session from the set-password gate so the
  // next request isn't bounced back here by middleware.
  const cookieStore = await cookies();
  cookieStore.set(PW_SETUP_COOKIE, "", passwordSetupCookieClearOptions());

  // Sign out the recovery session so the next page load lands on /login
  // clean — the user can sign in fresh with the new password.
  await client.auth.signOut({ scope: "local" });

  ctx.finish("ok");
  redirect("/login?reset=ok");
}
