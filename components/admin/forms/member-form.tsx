"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateMember } from "@/app/(protected)/admin/people/actions";
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

export function MemberForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateMember,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        Members are non-auth participant records &mdash; they never sign in. Email
        and phone are optional; capture whatever the leader already has.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="member-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="member-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Sam Member"
          />
        </div>
        <div>
          <label htmlFor="member-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="member-email"
            name="email"
            type="email"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="sam@example.com"
          />
        </div>
        <div>
          <label htmlFor="member-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="member-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add member"}
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
      {state?.ok ? <p style={successTextStyle}>Member added.</p> : null}
    </form>
  );
}
