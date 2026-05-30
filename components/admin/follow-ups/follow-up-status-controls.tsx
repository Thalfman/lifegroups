"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateFollowUpStatus } from "@/app/(protected)/admin/follow-ups/actions";
import { errorTextStyle, successTextStyle } from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { AdminFollowUpEntry } from "@/lib/supabase/read-models";
import type { FollowUpStatus } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

type Action = {
  status: FollowUpStatus;
  label: string;
  tone: "solid" | "ghost" | "terra";
};

export function FollowUpStatusControls({
  followUp,
}: {
  followUp: Pick<AdminFollowUpEntry, "id" | "status">;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateFollowUpStatus,
    undefined,
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
            <PButton type="submit" tone={action.tone} size="sm" disabled={pending}>
              {pending ? "Saving…" : action.label}
            </PButton>
          </form>
        ))}
      </div>
      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {state.errors.map((err, i) => (
            <li key={i}>
              <p style={errorTextStyle}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? <p style={successTextStyle}>Updated.</p> : null}
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
