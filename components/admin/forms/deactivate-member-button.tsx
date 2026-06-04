"use client";

import { PButton } from "@/components/pastoral/button";
import { adminDeactivateMember } from "@/app/(protected)/admin/people/actions";
import { useActionForm, FormStatus } from "./action-form";

export function DeactivateMemberButton({
  memberId,
  label = "Deactivate",
  fullName,
}: {
  memberId: string;
  label?: string;
  fullName?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminDeactivateMember
  );

  function confirmDeactivate(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        fullName
          ? `Deactivate ${fullName}? Their active group memberships will be closed today.`
          : "Deactivate this member? Their active group memberships will be closed today."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmDeactivate}>
        <input type="hidden" name="member_id" value={memberId} />
        <PButton
          type="submit"
          tone="terra"
          size="sm"
          disabled={pending}
          aria-label={fullName ? `${label} ${fullName}` : undefined}
        >
          {pending ? "Deactivating…" : label}
        </PButton>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
