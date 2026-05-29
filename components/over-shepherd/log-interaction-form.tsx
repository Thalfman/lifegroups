"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { overShepherdLogCareInteraction } from "@/app/(protected)/over-shepherd/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import type { ActionResult } from "@/lib/over-shepherd/action-result";
import type { ShepherdCareInteractionType } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

const INTERACTION_TYPES: ShepherdCareInteractionType[] = [
  "call",
  "text",
  "in_person",
  "meeting",
  "other",
];

// Local calendar day for the picker default/cap (avoids the UTC drift a
// toISOString slice would cause west of UTC in the evening). The server
// validator accepts up to UTC today + 1, so a local-today cap never rejects a
// date the server allows.
function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Over-Shepherd log-interaction form: a BROAD care touch only — date, type,
// and optional notes. There is deliberately no care-status, next-touchpoint,
// or admin-summary control here (those are admin-only / the deferred SC.1B
// follow-up half).
export function OverShepherdLogInteractionForm({
  shepherdProfileId,
}: {
  shepherdProfileId: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    overShepherdLogCareInteraction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="shepherd_profile_id" value={shepherdProfileId} />
      <p style={formNoteStyle}>
        Log a care touch — date and type are required. Notes are optional
        (max 2000 chars).
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="os-interaction_at" style={fieldLabelStyle}>
            Interaction date
          </label>
          <input
            id="os-interaction_at"
            name="interaction_at"
            type="date"
            required
            defaultValue={todayLocalIso()}
            max={todayLocalIso()}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-interaction_type" style={fieldLabelStyle}>
            Type
          </label>
          <select
            id="os-interaction_type"
            name="interaction_type"
            required
            defaultValue="call"
            style={fieldSelectStyle}
          >
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {shepherdCareInteractionTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="os-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars)
          </label>
          <textarea
            id="os-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="What did you talk about? What's the read?"
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Log interaction"}
          </PButton>
        </div>
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
      {state?.ok ? <p style={successTextStyle}>Interaction logged.</p> : null}
    </form>
  );
}
