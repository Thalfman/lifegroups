"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpdateShepherdCareFollowUpStatus } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { ShepherdCareFollowUpStatus } from "@/types/enums";

type Transition = {
  status: ShepherdCareFollowUpStatus;
  label: string;
  tone: "solid" | "ghost" | "terra";
};

// Status transitions mirror the SQL rule (any state may move to any other);
// these are the sensible forward/reopen moves surfaced per current state.
function transitionsFor(status: ShepherdCareFollowUpStatus): Transition[] {
  switch (status) {
    case "open":
      return [
        { status: "in_progress", label: "Start", tone: "solid" },
        { status: "done", label: "Mark done", tone: "terra" },
      ];
    case "in_progress":
      return [
        { status: "done", label: "Mark done", tone: "terra" },
        { status: "open", label: "Reopen", tone: "ghost" },
      ];
    case "done":
      return [
        { status: "in_progress", label: "Reopen", tone: "ghost" },
        { status: "open", label: "Reopen as open", tone: "ghost" },
      ];
  }
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
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {transitions.map((t) => (
          <form key={t.status} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUpId} />
            <input type="hidden" name="status" value={t.status} />
            <input
              type="hidden"
              name="shepherd_profile_id"
              value={shepherdProfileId}
            />
            <PButton
              type="submit"
              tone={t.tone}
              size="sm"
              disabled={pending}
              aria-label={`${t.label} follow-up: ${followUpTitle}${
                followUpDueDate ? ` (due ${followUpDueDate})` : ""
              }`}
            >
              {pending ? "Saving…" : t.label}
            </PButton>
          </form>
        ))}
      </div>
      <FormStatus state={state} />
    </div>
  );
}
