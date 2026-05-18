"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminDeactivateProfile } from "@/app/(protected)/admin/people/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function DeactivateProfileButton({
  profileId,
  label = "Deactivate",
  fullName,
}: {
  profileId: string;
  label?: string;
  fullName?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminDeactivateProfile,
    undefined,
  );

  function confirmDeactivate(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        fullName
          ? `Deactivate ${fullName}? Their leader assignments will also be closed.`
          : "Deactivate this profile? Their leader assignments will also be closed.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmDeactivate}>
        <input type="hidden" name="profile_id" value={profileId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Deactivating…" : label}
        </PButton>
      </form>
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
