"use client";

import { adminReopenGroup } from "@/app/(protected)/admin/groups/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Restores a previously archived group via the existing reopen RPC. Pure
// UI vocabulary swap from "Reopen" — the lifecycle_status enum value
// returns to 'active' as before.

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function restoreGroupConfirmMessage(groupName?: string): string {
  return groupName
    ? `Restore ${groupName}? It'll move back to the active roster.`
    : "Restore this group? It'll move back to the active roster.";
}

export function RestoreGroupButton({
  groupId,
  groupName,
  ariaLabel,
}: {
  groupId: string;
  groupName?: string;
  // Record-context accessible name (e.g. "Restore {group} · {area}") so repeated
  // restore controls in a list/table stay uniquely named for screen readers.
  // Falls back to the visible "Restore group" text when omitted.
  ariaLabel?: string;
}) {
  return (
    <ConfirmActionButton
      action={adminReopenGroup}
      confirmMessage={restoreGroupConfirmMessage(groupName)}
      hiddenFields={[{ name: "group_id", value: groupId }]}
      idleLabel="Restore group"
      pendingLabel="Restoring…"
      variant="primary"
      ariaLabel={ariaLabel}
    />
  );
}
