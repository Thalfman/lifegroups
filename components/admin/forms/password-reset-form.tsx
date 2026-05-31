"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminRequestPasswordReset } from "@/app/(protected)/admin/super-admin/account-actions";
import { errorTextStyle, successTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ email: string }> | undefined;

// Phase SAC.3 (#163): send a password-reset email to a profile's address via
// Supabase Auth (no service role). The send is audited server-side.
export function PasswordResetForm({
  profileId,
  email,
}: {
  profileId: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminRequestPasswordReset,
    undefined
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="email" value={email} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </PButton>
      {state?.ok ? (
        <span style={successTextStyle}>Reset email sent.</span>
      ) : null}
      {state && !state.ok ? (
        <p style={errorTextStyle}>{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}
