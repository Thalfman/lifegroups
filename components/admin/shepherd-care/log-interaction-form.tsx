"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminLogShepherdCareInteraction } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  shepherdCareInteractionTypeLabel,
  shepherdCareStatusLabel,
} from "@/lib/dashboard/labels";
import { P, fontBody } from "@/lib/pastoral";
import type { ActionResult } from "@/lib/admin/action-result";
import type {
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

const INTERACTION_TYPES: ShepherdCareInteractionType[] = [
  "call",
  "text",
  "in_person",
  "meeting",
  "other",
];

const STATUSES: ShepherdCareStatus[] = [
  "doing_well",
  "needs_encouragement",
  "needs_follow_up",
  "concern",
  "inactive",
];

// `defaultValue` uses the caller's LOCAL calendar day so the picker
// pre-fills with their natural "today" — using `toISOString().slice(0,10)`
// would silently drift one day forward for users west of UTC in
// evening hours. `max` uses local-today too: the server validator
// already accepts up to UTC today + 1 (which is always ≥ local today
// across all time zones), so a tighter local-today UI cap keeps the
// picker focused on past/today dates without rejecting anything the
// server allows.
function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function LogInteractionForm({
  shepherdProfileId,
}: {
  shepherdProfileId: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminLogShepherdCareInteraction,
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
        (max 2000 chars). Tick a box to also set a next touchpoint or change
        the care status on this profile.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="sc-interaction_at" style={fieldLabelStyle}>
            Interaction date
          </label>
          <input
            id="sc-interaction_at"
            name="interaction_at"
            type="date"
            required
            defaultValue={todayLocalIso()}
            max={todayLocalIso()}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="sc-interaction_type" style={fieldLabelStyle}>
            Type
          </label>
          <select
            id="sc-interaction_type"
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
        <div>
          <label htmlFor="sc-next_touchpoint_due" style={fieldLabelStyle}>
            Next touchpoint
          </label>
          <input
            id="sc-next_touchpoint_due"
            name="next_touchpoint_due"
            type="date"
            style={fieldInputStyle}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
            }}
          >
            <input
              type="checkbox"
              name="set_next_touchpoint_due"
              value="true"
            />
            Update next touchpoint
          </label>
        </div>
        <div>
          <label htmlFor="sc-current_status" style={fieldLabelStyle}>
            Care status
          </label>
          <select
            id="sc-current_status"
            name="current_status"
            defaultValue="doing_well"
            style={fieldSelectStyle}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {shepherdCareStatusLabel(s)}
              </option>
            ))}
          </select>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
            }}
          >
            <input type="checkbox" name="set_current_status" value="true" />
            Update care status
          </label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="sc-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="sc-notes"
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
