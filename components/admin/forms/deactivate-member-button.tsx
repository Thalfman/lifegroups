"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminDeactivateMember } from "@/app/(protected)/admin/people/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function DeactivateMemberButton({
  memberId,
  label = "Deactivate",
  fullName,
}: {
  memberId: string;
  label?: string;
  fullName?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminDeactivateMember,
    undefined,
  );

  function confirmDeactivate(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        fullName
          ? `Deactivate ${fullName}? Their active group memberships will be closed today.`
          : "Deactivate this member? Their active group memberships will be closed today.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmDeactivate}>
        <input type="hidden" name="member_id" value={memberId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Deactivating…" : label}
        </PButton>
      </form>
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
