"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = {};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "1.6px",
  color: "var(--c-ink3)",
  display: "block",
  marginBottom: 7,
};

const fieldContainerStyle: React.CSSProperties = {
  padding: "11px 13px",
  background: "var(--c-surface)",
  border: "1px solid var(--c-line)",
  borderRadius: 9,
  transition: "border-color 150ms",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const bareInputStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  color: "var(--c-ink)",
  outline: "none",
  width: "100%",
  padding: 0,
};

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p
          role="alert"
          style={{
            background: "var(--c-roseSoft)",
            border: "1px solid var(--c-rose)",
            borderRadius: 8,
            padding: "10px 12px",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            color: "var(--c-rose)",
            margin: 0,
          }}
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" style={labelStyle}>
          Email
        </label>
        <div className="lg-signin-field" style={fieldContainerStyle}>
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
            style={bareInputStyle}
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" style={labelStyle}>
          Password
        </label>
        <div className="lg-signin-field" style={fieldContainerStyle}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            style={bareInputStyle}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              border: 0,
              background: "transparent",
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              color: "var(--c-ink3)",
              cursor: pending ? "not-allowed" : "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <a
        href="/forgot-password"
        style={{
          alignSelf: "flex-end",
          fontFamily: "var(--font-sans)",
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--c-sageDeep)",
          textDecoration: "none",
        }}
      >
        Forgot password?
      </a>

      <button
        type="submit"
        disabled={pending}
        style={{
          width: "100%",
          padding: "13px 20px",
          borderRadius: 9,
          border: 0,
          background: "var(--c-sage)",
          color: "#fdfcf9",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.2px",
          boxShadow: "var(--c-shadow)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Signing in…" : "Sign in"}
        <ArrowRight size={15} strokeWidth={2} aria-hidden />
      </button>

      <div
        style={{
          marginTop: 4,
          background: "var(--c-sageTint)",
          border: "1px solid var(--c-line)",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <Heart
          size={14}
          strokeWidth={2}
          aria-hidden
          style={{
            color: "var(--c-sageDeep)",
            flexShrink: 0,
            marginTop: 2,
          }}
        />
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "var(--c-ink2)",
            margin: 0,
          }}
        >
          <strong style={{ color: "var(--c-ink)", fontWeight: 600 }}>
            Members don&rsquo;t sign in.
          </strong>{" "}
          This portal is for leaders, co-leaders, and ministry staff. If
          you&rsquo;re looking for a group, head to{" "}
          <a
            href="https://www.foxvalleychurch.org/life-groups"
            target="_blank"
            rel="noopener"
            style={{ color: "var(--c-clay)", fontWeight: 500 }}
          >
            Find a Life Group
          </a>
          .
        </p>
      </div>

      <style>{`
        .lg-signin-field:focus-within {
          border-color: var(--c-sage);
        }
      `}</style>
    </form>
  );
}
