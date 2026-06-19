"use client";

import { adminDeactivateProfile } from "@/app/(protected)/admin/people/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Exported so the copy stays byte-locked by the confirm-action-button test.
// "Archive" is the user-facing soft-delete label (CONTEXT.md glossary); the
// underlying audited RPC (admin_deactivate_profile) is unchanged (#645).
export function deactivateProfileConfirmMessage(fullName?: string): string {
  return fullName
    ? `Archive ${fullName}? Their shepherd assignments will also be closed.`
    : "Archive this profile? Their shepherd assignments will also be closed.";
}

export function DeactivateProfileButton({
  profileId,
  label = "Archive",
  fullName,
}: {
  profileId: string;
  label?: string;
  fullName?: string;
}) {
  return (
    <ConfirmActionButton
      action={adminDeactivateProfile}
      confirmMessage={deactivateProfileConfirmMessage(fullName)}
      hiddenFields={[{ name: "profile_id", value: profileId }]}
      idleLabel={label}
      pendingLabel="Archiving…"
      tone="terra"
      ariaLabel={fullName ? `${label} ${fullName}` : undefined}
    />
  );
}
