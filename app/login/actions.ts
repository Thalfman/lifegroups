"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultLandingPathForRole, type UserRole } from "@/lib/auth/roles";
import { isSafeNextPath } from "./next-path";
import type { ProfileStatus } from "@/types/enums";

export type LoginFormState = { error?: string };

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && isSafeNextPath(nextRaw) ? nextRaw : null;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { error: "Authentication is not configured on this deployment." };
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Invalid email or password." };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { error: "Sign-in succeeded but no session was created." };
  }

  const profileQuery = await client
    .from("profiles")
    .select("role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileQuery.error) {
    // Sign the user back out so the browser doesn't end up with an active
    // session while the form is telling them the login failed. Without this
    // they could refresh into protected routes despite the error message.
    // Scope `local` so we only revoke the session we just created, not every
    // session the user has across other devices.
    await client.auth.signOut({ scope: "local" });
    return { error: "Sign-in succeeded but we couldn't load your profile. Please try again." };
  }

  const profile = profileQuery.data as { role: UserRole; status: ProfileStatus } | null;

  if (!profile) {
    redirect("/unauthorized");
  }
  if (profile.status !== "active") {
    redirect("/unauthorized");
  }

  redirect(next ?? defaultLandingPathForRole(profile.role));
}
