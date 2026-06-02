"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpdateFollowUpStatus } from "@/app/(protected)/admin/follow-ups/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { AdminFollowUpEntry } from "@/lib/supabase/read-models";
import type { FollowUpStatus } from "@/types/enums";

type Action = {
  status: FollowUpStatus;
  label: string;
  tone: "solid" | "ghost" | "terra";
};

export function FollowUpStatusControls({
  followUp,
}: {
  followUp: Pick<AdminFollowUpEntry, "id" | "status" | "title">;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateFollowUpStatus
  );

  const actions = transitionsFor(followUp.status);
  if (actions.length === 0 && !state) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((action) => (
          <form key={action.status} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUp.id} />
            <input type="hidden" name="status" value={action.status} />
            <PButton
              type="submit"
              tone={action.tone}
              size="sm"
              disabled={pending}
              aria-label={`${action.label} follow-up: ${followUp.title}`}
            >
              {pending ? "Saving…" : action.label}
            </PButton>
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
        { status: "in_progress", label: "Start", tone: "solid" },
        { status: "done", label: "Mark done", tone: "terra" },
        { status: "snoozed", label: "Snooze", tone: "ghost" },
      ];
    case "in_progress":
      return [
        { status: "done", label: "Mark done", tone: "terra" },
        { status: "open", label: "Reopen", tone: "ghost" },
        { status: "snoozed", label: "Snooze", tone: "ghost" },
      ];
    case "snoozed":
      return [
        { status: "open", label: "Reopen", tone: "solid" },
        { status: "done", label: "Mark done", tone: "terra" },
      ];
    case "done":
      return [{ status: "open", label: "Reopen", tone: "ghost" }];
  }
}
