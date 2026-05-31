"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminSetProfileStatus } from "@/app/(protected)/admin/super-admin/account-actions";
import { errorTextStyle, successTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

// Phase SAC.3 (#163): disable / re-enable a profile. The hidden status field is
// the flipped value.
export function ProfileStatusForm({
  profileId,
  currentStatus,
}: {
  profileId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminSetProfileStatus,
    undefined
  );

  const isActive = currentStatus === "active";
  const nextStatus = isActive ? "inactive" : "active";

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="status" value={nextStatus} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Saving…" : isActive ? "Disable" : "Re-enable"}
      </PButton>
      {state?.ok ? <span style={successTextStyle}>Saved.</span> : null}
      {state && !state.ok ? (
        <p style={errorTextStyle}>{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}
