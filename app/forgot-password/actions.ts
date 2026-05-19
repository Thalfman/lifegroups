"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotPasswordState = {
  submitted?: boolean;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSiteUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

// Always returns the same generic success state so the form cannot be
// used to discover which emails are registered. Real failures (invalid
// site URL, Supabase unreachable) are logged server-side but never
// surfaced to the user.
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    console.warn(
      "[forgot-password] NEXT_PUBLIC_SITE_URL is not configured; reset emails will not include a valid redirectTo.",
    );
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    console.warn("[forgot-password] Supabase is not configured; skipping reset email send.");
    return { submitted: true };
  }

  const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    console.warn("[forgot-password] resetPasswordForEmail failed", error.message);
  }

  return { submitted: true };
}
