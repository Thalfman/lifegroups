"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminReopenGroup } from "@/app/(protected)/admin/groups/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function ReopenGroupButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminReopenGroup,
    undefined,
  );

  function confirmReopen(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        groupName
          ? `Reopen ${groupName}? It'll move back to the active roster.`
          : "Reopen this group? It'll move back to the active roster.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmReopen}>
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Reopening…" : "Reopen group"}
        </PButton>
      </form>
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
