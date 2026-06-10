"use client";

import { adminDeactivateProfile } from "@/app/(protected)/admin/people/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function deactivateProfileConfirmMessage(fullName?: string): string {
  return fullName
    ? `Deactivate ${fullName}? Their leader assignments will also be closed.`
    : "Deactivate this profile? Their leader assignments will also be closed.";
}

export function DeactivateProfileButton({
  profileId,
  label = "Deactivate",
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
      pendingLabel="Deactivating…"
      tone="terra"
      ariaLabel={fullName ? `${label} ${fullName}` : undefined}
    />
  );
}
