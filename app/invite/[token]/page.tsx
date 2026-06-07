import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callJsonRpc } from "@/lib/shared/rpc";
import { hashInviteToken } from "@/lib/shared/invite-token";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { InviteSignupForm } from "./invite-signup-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

type PeekStatus = "valid" | "expired" | "revoked" | "used" | "not_found";

type PeekResult = {
  status: PeekStatus;
  role?: keyof typeof ROLE_LABELS;
};

const STATUS_MESSAGES: Record<Exclude<PeekStatus, "valid">, string> = {
  expired: "This invite link has expired.",
  revoked: "This invite link has been turned off.",
  used: "This invite link has already been used.",
  not_found: "This invite link is invalid.",
};

async function peek(token: string): Promise<PeekResult | { error: string }> {
  const client = await createSupabaseServerClient();
  if (!client) return { error: "Sign-ups aren’t available right now." };
  const tokenHash = hashInviteToken(token);
  const { data, error } = await callJsonRpc(client, "peek_invitation", {
    p_token_hash: tokenHash,
  });
  if (error)
    return { error: "We couldn't check this link. Try again shortly." };
  const row = (data ?? {}) as { status?: string; role?: string };
  const status = (row.status ?? "not_found") as PeekStatus;
  return { status, role: row.role as PeekResult["role"] };
}

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const result = await peek(token);

  const ok = "status" in result && result.status === "valid";
  const notice =
    "error" in result
      ? result.error
      : result.status !== "valid"
        ? `${STATUS_MESSAGES[result.status]} Ask whoever invited you for a fresh link.`
        : null;
  const roleLabel =
    "status" in result && result.role ? ROLE_LABELS[result.role] : null;

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
            You&apos;re invited
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
            {ok ? "Set up your login" : "Invite link"}
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
            {ok
              ? `Create your account${
                  roleLabel ? ` as ${roleLabel}` : ""
                }. Enter your name and email and choose a password — at least 8 characters.`
              : "Let's get you set up."}
          </p>

          {notice ? (
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
              {notice}{" "}
              <Link
                href="/login"
                style={{
                  color: P.terra,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Go to sign in
              </Link>
              .
            </p>
          ) : (
            <InviteSignupForm token={token} />
          )}
        </div>
      </main>
    </div>
  );
}
