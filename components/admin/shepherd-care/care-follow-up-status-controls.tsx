"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateShepherdCareFollowUpStatus } from "@/app/(protected)/admin/shepherd-care/actions";
import { errorTextStyle } from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { ShepherdCareFollowUpStatus } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

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
  status,
  shepherdProfileId,
}: {
  followUpId: string;
  status: ShepherdCareFollowUpStatus;
  shepherdProfileId: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateShepherdCareFollowUpStatus,
    undefined,
  );

  const transitions = transitionsFor(status);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {transitions.map((t) => (
          <form key={t.status} action={formAction}>
            <input type="hidden" name="follow_up_id" value={followUpId} />
            <input type="hidden" name="status" value={t.status} />
            <input type="hidden" name="shepherd_profile_id" value={shepherdProfileId} />
            <PButton type="submit" tone={t.tone} size="sm" disabled={pending}>
              {pending ? "Saving…" : t.label}
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
    </div>
  );
}
