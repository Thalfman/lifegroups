"use client";

import { useActionState, useState } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import { redeemInviteAction, type RedeemInviteState } from "./actions";

const INITIAL_STATE: RedeemInviteState = {};

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

export function InviteSignupForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    redeemInviteAction,
    INITIAL_STATE
  );
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="full_name" style={labelStyle}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          disabled={pending}
          style={{ ...inputStyle, opacity: pending ? 0.6 : 1 }}
        />
      </div>

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
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
            style={{
              ...inputStyle,
              paddingRight: 76,
              opacity: pending ? 0.6 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            disabled={pending}
            aria-label={show ? "Hide password" : "Show password"}
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
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirm" style={labelStyle}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
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
        {pending ? "Creating your account…" : "Create account"}
      </PButton>
    </form>
  );
}
