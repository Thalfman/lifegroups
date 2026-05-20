"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error?: string };

const MIN_PASSWORD_LENGTH = 8;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) {
    return { error: "Enter your new password twice." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { error: "Password reset is not configured on this deployment." };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return {
      error:
        "Your reset link has expired or was already used. Request a new one from Forgot password.",
    };
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return { error: error.message || "Couldn't update your password. Try again." };
  }

  // Sign out the recovery session so the next page load lands on /login
  // clean — the user can sign in fresh with the new password.
  await client.auth.signOut({ scope: "local" });

  redirect("/login?reset=ok");
}
