"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCloseGroup } from "@/app/(protected)/admin/groups/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function CloseGroupButton({
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

  function confirmClose(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        groupName
          ? `Close ${groupName}? It'll stop appearing on the active roster, but everything stays in the record. You can reopen it later.`
          : "Close this group? It'll stop appearing on the active roster, but everything stays in the record. You can reopen it later.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmClose}>
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Closing…" : "Close group"}
        </PButton>
      </form>
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
