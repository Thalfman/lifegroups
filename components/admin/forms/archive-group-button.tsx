"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCloseGroup } from "@/app/(protected)/admin/groups/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

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
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCloseGroup,
    undefined,
  );

  function confirmArchive(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        groupName
          ? `Archive ${groupName}? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later.`
          : "Archive this group? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later.",
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
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
