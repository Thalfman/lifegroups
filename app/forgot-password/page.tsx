import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div
      className="lg-m-noscrollx"
      style={{
        background: P.bg,
        minHeight: "100vh",
        fontFamily: fontBody,
        color: P.ink,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div aria-hidden="true" style={paperGrain} />

      <header
        style={{
          padding: "18px clamp(20px, 5vw, 36px)",
          background: P.surface,
          borderBottom: `1px solid ${P.line}`,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <PSeal />
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.2,
              color: P.ink,
            }}
          >
            Fox Valley Church Life Groups
          </div>
        </Link>
      </header>

      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "clamp(40px, 8vw, 80px) 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            Reset password
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: "clamp(26px, 4vw, 32px)",
              margin: "0 0 14px",
              fontWeight: 600,
              letterSpacing: -0.3,
              color: P.ink,
            }}
          >
            Forgot your password?
          </h1>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink2,
              marginTop: 0,
              marginBottom: 24,
              lineHeight: 1.55,
            }}
          >
            Enter your email and we&apos;ll send a reset link.
          </p>

          <ForgotPasswordForm />

          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink3,
              marginTop: 20,
              marginBottom: 0,
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            <Link
              href="/login"
              style={{
                color: P.terra,
                fontFamily: fontSans,
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
