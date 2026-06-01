"use client";

import { PButton } from "@/components/pastoral/button";
import { leaderUpdateFollowUpStatus } from "@/app/(protected)/leader/follow-up-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { FollowUpStatus } from "@/types/enums";

export function LeaderFollowUpStatusButton({
  followUpId,
  status,
}: {
  followUpId: string;
  status: FollowUpStatus;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    leaderUpdateFollowUpStatus
  );

  const transitions = allowedFor(status);
  if (transitions.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {transitions.map((t) => (
          <form key={t.next} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUpId} />
            <input type="hidden" name="status" value={t.next} />
            <PButton type="submit" tone={t.tone} size="sm" disabled={pending}>
              {pending ? "Saving…" : t.label}
            </PButton>
          </form>
        ))}
      </div>
      <FormStatus state={state} />
    </div>
  );
}

type Transition = {
  next: "in_progress" | "done";
  label: string;
  tone: "solid" | "ghost" | "terra";
};

function allowedFor(status: FollowUpStatus): Transition[] {
  if (status === "open") {
    return [
      { next: "in_progress", label: "Start", tone: "solid" },
      { next: "done", label: "Mark done", tone: "terra" },
    ];
  }
  if (status === "in_progress") {
    return [{ next: "done", label: "Mark done", tone: "terra" }];
  }
  // done or snoozed: leader cannot transition.
  return [];
}
