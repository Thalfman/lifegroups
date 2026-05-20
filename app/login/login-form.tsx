"use client";

import { useActionState, useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);

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

      <div>
        <label htmlFor="password" style={labelStyle}>
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            style={{
              ...inputStyle,
              paddingRight: 76,
              opacity: pending ? 0.6 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              top: "50%",
              right: 10,
              transform: "translateY(-50%)",
              border: 0,
              background: "transparent",
              color: P.terra,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 700,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.5 : 1,
              padding: "6px 8px",
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
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
