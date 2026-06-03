"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";
import { loginAction, type LoginFormState } from "./actions";
import { isSafeNextPath } from "./next-path";

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

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    INITIAL_STATE
  );
  const [showPassword, setShowPassword] = useState(false);
  // Read the sign-in search params on the client so this page can be statically
  // generated and CDN-served (no per-request server render). Using
  // window.location.search rather than next/navigation's useSearchParams()
  // avoids forcing a Suspense boundary / dynamic deopt, so the form markup still
  // ships in the prerendered HTML. The `next` allow-list is shared with the
  // server action via isSafeNextPath, keeping one source of truth for the
  // open-redirect guard.
  const [next, setNext] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextValue = params.get("next");
    setNext(nextValue && isSafeNextPath(nextValue) ? nextValue : null);
    setResetOk(params.get("reset") === "ok");
  }, []);

  return (
    <>
      {/* The reset confirmation is the one piece of per-URL content that only
          becomes known client-side (after the useEffect reads ?reset=ok). On a
          statically-prerendered page it can't be in the first paint, so render
          it as a fixed-position toast (out of normal flow) rather than an inline
          banner: that way its post-hydration appearance can't push the centered
          form down, avoiding a CLS the rest of the page doesn't have. */}
      {resetOk && !state.error ? (
        <p
          role="status"
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            width: "calc(100% - 48px)",
            maxWidth: 460,
            background: "var(--c-sageTint)",
            border: "1px solid var(--c-sage)",
            borderRadius: 8,
            padding: "10px 12px",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            color: "var(--c-ink2)",
            margin: 0,
            boxShadow: "var(--c-shadowLg)",
            textAlign: "center",
          }}
        >
          Password updated. Sign in.
        </p>
      ) : null}

      <form
        action={formAction}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Always rendered (value defaults to "") so it ships in the static
            HTML and hydrates without a structural mismatch; the effect fills in
            the validated `next` on mount. An empty value is treated as "no
            next" by loginAction (isSafeNextPath rejects ""), matching the
            previous behavior. */}
        <input type="hidden" name="next" value={next ?? ""} />

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

        <Link
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
        </Link>

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
              rel="noopener noreferrer"
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
    </>
  );
}
