"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { leaderUpdateFollowUpStatus } from "@/app/(protected)/leader/follow-up-actions";
import type { ActionResult } from "@/lib/leader/action-result";
import type { FollowUpStatus } from "@/types/enums";
import { P, fontBody } from "@/lib/pastoral";

type State = ActionResult<{ id: string }> | undefined;

export function LeaderFollowUpStatusButton({
  followUpId,
  status,
}: {
  followUpId: string;
  status: FollowUpStatus;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    leaderUpdateFollowUpStatus,
    undefined,
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
      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {state.errors.map((err, i) => (
            <li key={i}>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 12,
                  color: "#923220",
                  background: P.terraSoft,
                  padding: "6px 10px",
                  borderRadius: 6,
                  margin: 0,
                }}
              >
                {err}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
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
