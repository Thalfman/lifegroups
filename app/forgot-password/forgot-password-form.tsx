"use client";

import { useActionState } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const INITIAL_STATE: ForgotPasswordState = {};

const labelStyle = {
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase" as const,
  color: P.ink2,
  display: "block" as const,
  marginBottom: 7,
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: 10,
  border: `1px solid ${P.line}`,
  fontSize: 14,
  fontFamily: fontBody,
  background: P.surface,
  color: P.ink,
  outline: "none",
};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    INITIAL_STATE,
  );

  if (state.submitted) {
    return (
      <div
        role="status"
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderLeft: `3px solid ${P.sage}`,
          borderRadius: 10,
          padding: "14px 16px",
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink2,
          lineHeight: 1.55,
        }}
      >
        If an account exists for that email, a reset link has been sent.
      </div>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <div>
        <label htmlFor="email" style={labelStyle}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          disabled={pending}
          style={{ ...inputStyle, opacity: pending ? 0.6 : 1 }}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderLeft: `3px solid ${P.terra}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontFamily: fontBody,
            fontSize: 13,
            color: "#7d3621",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {state.error}
        </p>
      ) : null}

      <PButton
        type="submit"
        tone="terra"
        disabled={pending}
        style={{ width: "100%", padding: "14px", fontSize: 14 }}
      >
        {pending ? "Sending…" : "Send reset link"}
      </PButton>
    </form>
  );
}
