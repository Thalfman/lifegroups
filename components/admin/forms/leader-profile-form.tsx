"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateLeaderProfile } from "@/app/(protected)/admin/people/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function LeaderProfileForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateLeaderProfile,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        Leaders sign in to record attendance and pulses. Sign-in linkage is handled
        through the documented authentication setup &mdash; this form just creates
        the profile row.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="leader-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="leader-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Julian Example"
          />
        </div>
        <div>
          <label htmlFor="leader-email" style={fieldLabelStyle}>
            Email
          </label>
          <input
            id="leader-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="julian@example.com"
          />
        </div>
        <div>
          <label htmlFor="leader-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="leader-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add leader"}
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
      {state?.ok ? <p style={successTextStyle}>Leader profile added.</p> : null}
    </form>
  );
}
