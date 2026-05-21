"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateOverShepherd } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function OverShepherdCreateForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateOverShepherd,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        Add a coach or over-shepherd. They do not need an app login —
        these records exist only so Julian can track coverage. Notes are
        admin-only and never appear in audit summaries.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="os-create-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="os-create-full_name"
            name="full_name"
            type="text"
            required
            maxLength={200}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-create-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="os-create-email"
            name="email"
            type="email"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-create-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="os-create-phone"
            name="phone"
            type="tel"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="os-create-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="os-create-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Anything Julian wants to remember about this over-shepherd."
          />
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add over-shepherd"}
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
      {state?.ok ? <p style={successTextStyle}>Over-shepherd added.</p> : null}
    </form>
  );
}
