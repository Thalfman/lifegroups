"use client";

import { useActionState } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = {};

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

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label htmlFor="email" style={labelStyle}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          style={{ ...inputStyle, opacity: pending ? 0.6 : 1 }}
        />
      </div>

      <div>
        <label htmlFor="password" style={labelStyle}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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
            fontStyle: "italic",
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
        {pending ? "Signing in…" : "Sign in"}
      </PButton>
    </form>
  );
}
