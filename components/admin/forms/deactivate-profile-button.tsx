"use client";

import { PButton } from "@/components/pastoral/button";
import { adminDeactivateProfile } from "@/app/(protected)/admin/people/actions";
import { useActionForm, FormStatus } from "./action-form";

export function DeactivateProfileButton({
  profileId,
  label = "Deactivate",
  fullName,
}: {
  profileId: string;
  label?: string;
  fullName?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminDeactivateProfile
  );

  function confirmDeactivate(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        fullName
          ? `Deactivate ${fullName}? Their leader assignments will also be closed.`
          : "Deactivate this profile? Their leader assignments will also be closed."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirmDeactivate}>
        <input type="hidden" name="profile_id" value={profileId} />
        <PButton
          type="submit"
          tone="ghost"
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
