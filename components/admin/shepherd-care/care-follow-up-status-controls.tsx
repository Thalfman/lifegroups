"use client";

import {
  adminArchiveShepherdCareFollowUp,
  adminUpdateShepherdCareFollowUpStatus,
} from "@/app/(protected)/admin/shepherd-care/follow-up-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { ConfirmActionButton } from "@/components/admin/forms/confirm-action-button";
import type { ShepherdCareFollowUpStatus } from "@/types/enums";
import { Button } from "@/components/ui/button";

type Transition = {
  status: ShepherdCareFollowUpStatus;
  label: string;
  variant: "solid" | "ghost" | "primary";
};

// Status transitions mirror the SQL rule (any state may move to any other);
// these are the sensible forward/reopen moves surfaced per current state.
function transitionsFor(status: ShepherdCareFollowUpStatus): Transition[] {
  switch (status) {
    case "open":
      return [
        { status: "in_progress", label: "Start", variant: "solid" },
        { status: "done", label: "Mark done", variant: "primary" },
      ];
    case "in_progress":
      return [
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "open", label: "Reopen", variant: "ghost" },
      ];
    case "done":
      return [
        { status: "in_progress", label: "Reopen", variant: "ghost" },
        { status: "open", label: "Reopen as open", variant: "ghost" },
      ];
  }
}

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function archiveFollowUpConfirmMessage(followUpTitle: string): string {
  return `Archive the follow-up "${followUpTitle}"? It leaves every queue but stays in history; it can't be un-archived from here.`;
}

export function CareFollowUpStatusControls({
  followUpId,
  followUpTitle,
  followUpDueDate,
  status,
  shepherdProfileId,
}: {
  followUpId: string;
  followUpTitle: string;
  followUpDueDate: string | null;
  status: ShepherdCareFollowUpStatus;
  shepherdProfileId: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateShepherdCareFollowUpStatus
  );

  const transitions = transitionsFor(status);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <form key={t.status} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUpId} />
            <input type="hidden" name="status" value={t.status} />
            <input
              type="hidden"
              name="shepherd_profile_id"
              value={shepherdProfileId}
            />
            <Button
              type="submit"
              variant={t.variant}
              size="sm"
              disabled={pending}
              aria-label={`${t.label} follow-up: ${followUpTitle}${
                followUpDueDate ? ` (due ${followUpDueDate})` : ""
              }`}
            >
              {pending ? "Saving…" : t.label}
            </Button>
          </form>
        ))}
        {/* Archive is its own action with its own pending/error state (the
            status line renders with its button), available in every status so
            an accidental/test follow-up can be cleaned up whether it's still
            open or already done. */}
        <ConfirmActionButton
          action={adminArchiveShepherdCareFollowUp}
          confirmMessage={archiveFollowUpConfirmMessage(followUpTitle)}
          hiddenFields={[
            { name: "follow_up_id", value: followUpId },
            { name: "shepherd_profile_id", value: shepherdProfileId },
          ]}
          idleLabel="Archive"
          pendingLabel="Archiving…"
          variant="ghost"
          ariaLabel={`Archive follow-up: ${followUpTitle}${
            followUpDueDate ? ` (due ${followUpDueDate})` : ""
          }`}
          alignEnd={false}
        />
      </div>
      <FormStatus state={state} />
    </div>
  );
}
