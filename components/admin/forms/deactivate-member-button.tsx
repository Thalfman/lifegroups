"use client";

import { adminDeactivateMember } from "@/app/(protected)/admin/people/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function deactivateMemberConfirmMessage(fullName?: string): string {
  return fullName
    ? `Deactivate ${fullName}? Their active group memberships will be closed today.`
    : "Deactivate this member? Their active group memberships will be closed today.";
}

export function DeactivateMemberButton({
  memberId,
  label = "Deactivate",
  fullName,
}: {
  memberId: string;
  label?: string;
  fullName?: string;
}) {
  return (
    <ConfirmActionButton
      action={adminDeactivateMember}
      confirmMessage={deactivateMemberConfirmMessage(fullName)}
      hiddenFields={[{ name: "member_id", value: memberId }]}
      idleLabel={label}
      pendingLabel="Deactivating…"
      tone="terra"
      ariaLabel={fullName ? `${label} ${fullName}` : undefined}
    />
  );
}
