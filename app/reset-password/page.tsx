import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ code?: string | string[] }>;

// Supabase password-recovery emails send the user to this page with a
// `?code=...` PKCE param. We exchange it for a recovery session here so
// the form's server action sees an authenticated user. PKCE codes are
// single-use, so we check for an existing session first — that keeps a
// refresh (with the still-present ?code= in the URL) from invalidating
// a session we already established.
async function maybeExchangeCode(code: string | undefined): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return "Password reset is not configured on this deployment.";

  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) return null;

  if (!code) {
    return "No reset code provided. Request a new link from Forgot password.";
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return "Your reset link has expired or was already used. Request a new one from Forgot password.";
  }
  return null;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const codeRaw = params.code;
  const code = Array.isArray(codeRaw) ? codeRaw[0] : codeRaw;
  const exchangeError = await maybeExchangeCode(code);

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
            Set a new password
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
            Choose a new password for your account. Must be at least 8
            characters.
          </p>

          {exchangeError ? (
            <p
              role="alert"
              style={{
                background: P.surface,
                border: `1px solid ${P.line}`,
                borderLeft: `3px solid ${P.terra}`,
                borderRadius: 10,
                padding: "12px 16px",
                fontFamily: fontBody,
                fontSize: 13,
                color: "#7d3621",
                margin: "0 0 18px",
                lineHeight: 1.5,
              }}
            >
              {exchangeError}{" "}
              <Link
                href="/forgot-password"
                style={{
                  color: P.terra,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Request a new link
              </Link>
              .
            </p>
          ) : (
            <ResetPasswordForm />
          )}
        </div>
      </main>
    </div>
  );
}
