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
  ariaLabel,
}: {
  groupId: string;
  groupName?: string;
  // Record-context accessible name (e.g. "Restore {group} · {area}") so repeated
  // restore controls in a list/table stay uniquely named for screen readers.
  // Falls back to the visible "Restore group" text when omitted.
  ariaLabel?: string;
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
        <PButton
          type="submit"
          tone="terra"
          size="sm"
          disabled={pending}
          aria-label={ariaLabel}
        >
          {pending ? "Restoring…" : "Restore group"}
        </PButton>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
