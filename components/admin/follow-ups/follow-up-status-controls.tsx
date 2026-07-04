"use client";

import { adminUpdateFollowUpStatus } from "@/app/(protected)/admin/follow-ups/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { AdminFollowUpEntry } from "@/lib/supabase/follow-up-reads";
import type { FollowUpStatus } from "@/types/enums";
import { Button } from "@/components/ui/button";

type Action = {
  status: FollowUpStatus;
  label: string;
  variant: "solid" | "ghost" | "primary";
};

export function FollowUpStatusControls({
  followUp,
}: {
  followUp: Pick<AdminFollowUpEntry, "id" | "status" | "title" | "due_date">;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateFollowUpStatus
  );

  const actions = transitionsFor(followUp.status);
  if (actions.length === 0 && !state) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <form key={action.status} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUp.id} />
            <input type="hidden" name="status" value={action.status} />
            <Button
              type="submit"
              variant={action.variant}
              size="sm"
              disabled={pending}
              aria-label={`${action.label} follow-up: ${followUp.title}${
                followUp.due_date ? ` (due ${followUp.due_date})` : ""
              }`}
            >
              {pending ? "Saving…" : action.label}
            </Button>
          </form>
        ))}
      </div>
      <FormStatus state={state} successText="Updated." />
    </div>
  );
}

function transitionsFor(status: FollowUpStatus): Action[] {
  switch (status) {
    case "open":
      return [
        { status: "in_progress", label: "Start", variant: "solid" },
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "snoozed", label: "Snooze", variant: "ghost" },
      ];
    case "in_progress":
      return [
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "open", label: "Reopen", variant: "ghost" },
        { status: "snoozed", label: "Snooze", variant: "ghost" },
      ];
    case "snoozed":
      return [
        { status: "open", label: "Reopen", variant: "solid" },
        { status: "done", label: "Mark done", variant: "primary" },
      ];
    case "done":
      return [{ status: "open", label: "Reopen", variant: "ghost" }];
  }
}
