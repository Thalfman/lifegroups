"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCloseGroup } from "@/app/(protected)/admin/groups/actions";
import { useActionForm, FormStatus } from "./action-form";

// Archives a group via the existing soft-close RPC. The lifecycle_status
// enum value stored in the database stays 'closed' — this is purely a UI
// vocabulary swap so the destructive action reads clearly and can't be
// confused with "cancel the edit panel".
export function ArchiveGroupButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCloseGroup
  );

  function confirmArchive(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        groupName
          ? `Archive ${groupName}? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later.`
          : "Archive this group? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmArchive}>
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Archiving…" : "Archive group"}
        </PButton>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
