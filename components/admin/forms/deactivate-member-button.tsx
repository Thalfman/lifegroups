"use client";

import { adminDeactivateMember } from "@/app/(protected)/admin/people/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Exported so the copy stays byte-locked by the confirm-action-button test.
// "Archive" is the user-facing soft-delete label (CONTEXT.md glossary); the
// underlying audited RPC (admin_deactivate_member) is unchanged (#645).
export function deactivateMemberConfirmMessage(fullName?: string): string {
  return fullName
    ? `Archive ${fullName}? Their active group memberships will be closed today.`
    : "Archive this member? Their active group memberships will be closed today.";
}

export function DeactivateMemberButton({
  memberId,
  label = "Archive",
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
      pendingLabel="Archiving…"
      tone="terra"
      ariaLabel={fullName ? `${label} ${fullName}` : undefined}
    />
  );
}
