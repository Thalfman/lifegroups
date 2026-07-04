"use client";

import { adminCloseGroup } from "@/app/(protected)/admin/groups/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Archives a group via the existing soft-close RPC. The lifecycle_status
// enum value stored in the database stays 'closed' — this is purely a UI
// vocabulary swap so the destructive action reads clearly and can't be
// confused with "cancel the edit panel".

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function archiveGroupConfirmMessage(groupName?: string): string {
  return groupName
    ? `Archive ${groupName}? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later.`
    : "Archive this group? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later.";
}

export function ArchiveGroupButton({
  groupId,
  groupName,
  // Inside the editing drawer (#266) the group leaves the active roster on
  // archive, so let the drawer close + refresh once the close lands, and keep
  // it open while the archive is in flight.
  onArchived,
  onPendingChange,
}: {
  groupId: string;
  groupName?: string;
  onArchived?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  return (
    <ConfirmActionButton
      action={adminCloseGroup}
      confirmMessage={archiveGroupConfirmMessage(groupName)}
      hiddenFields={[{ name: "group_id", value: groupId }]}
      idleLabel="Archive group"
      pendingLabel="Archiving…"
      variant="ghost"
      ariaLabel={groupName ? `Archive ${groupName}` : undefined}
      onSuccess={onArchived}
      onPendingChange={onPendingChange}
    />
  );
}
