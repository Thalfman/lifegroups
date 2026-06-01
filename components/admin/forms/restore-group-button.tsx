"use client";

import { PButton } from "@/components/pastoral/button";
import { adminReopenGroup } from "@/app/(protected)/admin/groups/actions";
import { useActionForm, FormStatus } from "./action-form";

// Restores a previously archived group via the existing reopen RPC. Pure
// UI vocabulary swap from "Reopen" — the lifecycle_status enum value
// returns to 'active' as before.
export function RestoreGroupButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminReopenGroup
  );

  function confirmRestore(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        groupName
          ? `Restore ${groupName}? It'll move back to the active roster.`
          : "Restore this group? It'll move back to the active roster."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmRestore}>
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Restoring…" : "Restore group"}
        </PButton>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
