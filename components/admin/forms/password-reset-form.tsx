"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminRequestPasswordReset } from "@/app/(protected)/admin/super-admin/account-actions";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.3 (#163): send a password-reset email to a profile's address via
// Supabase Auth (no service role). The send is audited server-side.
export function PasswordResetForm({
  profileId,
  email,
}: {
  profileId: string;
  email: string;
}) {
  const { state, formAction, pending } = useActionForm<{ email: string }>(
    superAdminRequestPasswordReset
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="email" value={email} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </PButton>
      <FormStatus state={state} successText="Reset email sent." />
    </form>
  );
}
