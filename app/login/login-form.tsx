"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = {};

const labelStyle = {
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.6,
  textTransform: "uppercase" as const,
  color: P.ink3,
  display: "block" as const,
  fontWeight: 600,
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  padding: 0,
};

const fieldShellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 8,
  padding: "11px 13px",
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 9,
  transition: "border-color .15s",
};

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p
          role="alert"
          style={{
            background: P.terraSoft,
            border: `1px solid ${P.line}`,
            borderRadius: 9,
            padding: "10px 14px",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.terraTextStrong,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {state.error}
        </p>
      ) : null}

      <label htmlFor="email" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={labelStyle}>Email</span>
        <div className="lg-login-field" style={fieldShellStyle}>
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
            placeholder="you@foxvalleychurch.org"
            style={{ ...inputStyle, opacity: pending ? 0.6 : 1 }}
          />
        </div>
      </label>

      <label htmlFor="password" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={labelStyle}>Password</span>
        <div className="lg-login-field" style={fieldShellStyle}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            placeholder="••••••••"
            style={{ ...inputStyle, opacity: pending ? 0.6 : 1 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              background: "transparent",
              border: "none",
              cursor: pending ? "not-allowed" : "pointer",
              color: P.ink3,
              fontFamily: fontSans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: 0,
              opacity: pending ? 0.5 : 1,
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 2,
        }}
      >
        <Link
          href="/forgot-password"
          style={{
            fontFamily: fontSans,
            fontSize: 12.5,
            color: P.sageTextStrong,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Forgot password?
        </Link>
      </div>

      <PButton
        type="submit"
        disabled={pending}
        style={{
          marginTop: 6,
          width: "100%",
          padding: "13px 20px",
          background: P.sage,
          color: P.surface,
          border: `1px solid ${P.sage}`,
          borderRadius: 9,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.2,
          boxShadow:
            "0 1px 2px rgba(60,45,30,0.04), 0 4px 14px rgba(60,45,30,0.04)",
        }}
      >
        {pending ? "Signing in…" : "Sign in"}
        {pending ? null : <ArrowRight size={15} strokeWidth={1.8} />}
      </PButton>

      <div
        style={{
          marginTop: 4,
          padding: "10px 12px",
          background: P.sageSoft,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <Heart
          size={14}
          strokeWidth={1.6}
          color={P.sageTextStrong}
          style={{ flexShrink: 0, marginTop: 2 }}
          aria-hidden="true"
        />
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 11.5,
            lineHeight: 1.5,
            color: P.ink2,
          }}
        >
          <strong style={{ color: P.ink, fontWeight: 600 }}>
            Members don&rsquo;t sign in.
          </strong>{" "}
          This portal is for leaders, co-leaders, and ministry staff. If
          you&rsquo;re looking for a group, head to{" "}
          <a
            href="https://www.foxvalleychurch.org/life-groups"
            style={{ color: P.terra, fontWeight: 500 }}
          >
            Find a Life Group
          </a>
          .
        </div>
      </div>
    </form>
  );
}
