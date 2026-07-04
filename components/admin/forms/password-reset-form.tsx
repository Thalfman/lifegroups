"use client";

import { superAdminRequestPasswordReset } from "@/app/(protected)/admin/super-admin/account-actions";
import { useActionForm, FormStatus } from "./action-form";
import { Button } from "@/components/ui/button";

// Phase SAC.3 (#163): send a password-reset email to a profile's address via
// Supabase Auth (no service role). The send is audited server-side.
export function PasswordResetForm({
  profileId,
  profileName,
  email,
}: {
  profileId: string;
  // The person's name, folded into the accessible label so screen-reader users
  // can tell the repeated row actions apart (#456).
  profileName: string;
  email: string;
}) {
  const { state, formAction, pending } = useActionForm<{ email: string }>(
    superAdminRequestPasswordReset
  );

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="email" value={email} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Send password reset link to ${profileName}`}
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <FormStatus state={state} successText="Reset email sent." />
    </form>
  );
}
