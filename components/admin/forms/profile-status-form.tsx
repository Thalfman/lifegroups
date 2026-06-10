"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminSetProfileStatus } from "@/app/(protected)/admin/super-admin/account-actions";
import { P } from "@/lib/pastoral";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.3 (#163): disable / re-enable a profile. The hidden status field is
// the flipped value.
export function ProfileStatusForm({
  profileId,
  profileName,
  currentStatus,
}: {
  profileId: string;
  // The person's name, folded into the accessible label so screen-reader users
  // can tell the repeated row actions apart (#456).
  profileName: string;
  currentStatus: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetProfileStatus
  );

  const isActive = currentStatus === "active";
  const nextStatus = isActive ? "inactive" : "active";

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="status" value={nextStatus} />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending}
        aria-label={
          isActive
            ? `Disable account for ${profileName}`
            : `Re-enable account for ${profileName}`
        }
        // Disabling is the disruptive direction — outlined terra (the shared
        // destructive accent) so it can't read like the neighbouring safe
        // actions. Re-enable stays an ordinary ghost button.
        style={
          isActive
            ? { borderColor: P.terra, color: P.terraTextStrong }
            : undefined
        }
      >
        {pending ? "Saving…" : isActive ? "Disable" : "Re-enable"}
      </PButton>
      <FormStatus state={state} successText="Saved." />
    </form>
  );
}
