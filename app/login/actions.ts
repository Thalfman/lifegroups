"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultLandingPathForRole, type UserRole } from "@/lib/auth/roles";

export type LoginFormState = { error?: string };

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : null;

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
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profile = profileQuery.data as { role: UserRole } | null;

  if (!profile) {
    redirect("/unauthorized");
  }

  redirect(next ?? defaultLandingPathForRole(profile.role));
}
