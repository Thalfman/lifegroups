import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";
import { PButton } from "@/components/pastoral/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  code?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
  status?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// What the page should render. The single-use recovery token is NOT consumed
// here — that happens in /auth/confirm only when the user clicks the button
// below, so an email-provider link scanner's GET of this page burns nothing.
type View =
  | { kind: "not_configured" }
  | { kind: "form" } // recovery session already established (post /auth/confirm)
  | { kind: "confirm"; fields: Record<string, string> } // valid-looking link → show the button
  | { kind: "invalid" }; // missing/used/expired link → resend CTA

async function resolveView(params: {
  code?: string;
  tokenHash?: string;
  type?: string;
  status?: string;
}): Promise<View> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "not_configured" };

  // A recovery session set by /auth/confirm means we can show the form. We
  // check this first so a refresh after confirming doesn't fall back to the
  // (now-consumed) link state.
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) return { kind: "form" };

  if (params.status === "invalid") return { kind: "invalid" };

  // Carry the link params into a form that POSTs to /auth/confirm, which spends
  // the token via verifyOtp / exchangeCodeForSession on the user's explicit
  // click. A POST (not a link) means Next can't prefetch it and a scanner's GET
  // can't reach it — so nothing is consumed before the user acts.
  const next = "/reset-password";
  if (params.tokenHash && params.type) {
    return {
      kind: "confirm",
      fields: { token_hash: params.tokenHash, type: params.type, next },
    };
  }
  if (params.code) {
    return { kind: "confirm", fields: { code: params.code, next } };
  }

  return { kind: "invalid" };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const view = await resolveView({
    code: first(params.code),
    tokenHash: first(params.token_hash),
    type: first(params.type),
    status: first(params.status),
  });

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
            {view.kind === "form"
              ? "Set a new password"
              : view.kind === "confirm"
                ? "Confirm it's you"
                : view.kind === "not_configured"
                  ? "Reset password"
                  : "Link expired or already used"}
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
            {view.kind === "form"
              ? "Choose a new password for your account. Must be at least 8 characters."
              : view.kind === "confirm"
                ? "For your security, confirm below to continue resetting your password. Reset links can only be used once."
                : view.kind === "not_configured"
                  ? "Password reset is not available on this deployment right now."
                  : "Reset links can only be used once and expire after a short time. Request a fresh one and use it right away."}
          </p>

          {view.kind === "form" ? (
            <ResetPasswordForm />
          ) : view.kind === "confirm" ? (
            <form method="post" action="/auth/confirm">
              {Object.entries(view.fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <PButton
                type="submit"
                tone="terra"
                style={{ width: "100%", padding: "14px", fontSize: 14 }}
              >
                Set my new password
              </PButton>
            </form>
          ) : (
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
              {view.kind === "not_configured"
                ? "Password reset is not configured on this deployment."
                : "This reset link is invalid, was already used, or has expired."}{" "}
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
          )}
        </div>
      </main>
    </div>
  );
}
