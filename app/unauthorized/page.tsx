import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { POrnament, PSeal } from "@/components/pastoral/atoms";
import { PButton, PLinkButton } from "@/components/pastoral/button";
import { logoutAction } from "@/app/(protected)/actions";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Reason = "unavailable" | undefined;

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string }>;
}) {
  const session = await getCurrentSession();
  const sp = (await searchParams) ?? {};
  const reason: Reason = sp.reason === "unavailable" ? "unavailable" : undefined;
  // Backend transient failures surface here via /unauthorized?reason=unavailable
  // and also when the session itself is in backend_error state. Show a
  // service-unavailable message in that case so users don't try to
  // self-remediate a misdiagnosed "account not linked" path.
  const isUnavailable = reason === "unavailable" || session.kind === "backend_error";
  const isSignedIn = !isUnavailable && session.kind !== "anonymous";
  const hasLinkedProfile = !isUnavailable && session.kind === "authenticated";

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
        className="lg-m-shell-header"
        style={{
          padding: "18px 36px",
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
          padding: "40px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 18,
            padding: "clamp(28px, 5vw, 44px)",
            maxWidth: 520,
            width: "100%",
            boxShadow: "0 30px 60px -30px rgba(58,42,26,0.18)",
          }}
        >
          <POrnament w={80} />
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 600,
              margin: "14px 0 8px",
            }}
          >
            {isUnavailable ? "Service unavailable" : "No access"}
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: "clamp(28px, 4vw, 36px)",
              margin: 0,
              fontWeight: 600,
              letterSpacing: -0.5,
              lineHeight: 1.1,
              color: P.ink,
            }}
          >
            {isUnavailable
              ? "We can’t reach the service right now."
              : "You don’t have access."}
          </h1>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 15,
              color: P.ink2,
              marginTop: 14,
              marginBottom: 0,
              lineHeight: 1.6,
            }}
          >
            {isUnavailable
              ? "This is usually temporary. Please try again in a minute. If it keeps happening, contact a ministry admin."
              : isSignedIn && !hasLinkedProfile
                ? "Your sign-in worked, but your account isn't linked to a ministry profile yet. Ask a ministry admin to invite you."
                : "Your account doesn't have access here. If you think this is wrong, contact a ministry admin."}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 24,
            }}
          >
            <PLinkButton href="/" tone="ghost">
              Back to home
            </PLinkButton>
            {isSignedIn ? (
              <form action={logoutAction}>
                <PButton type="submit" tone="solid">
                  Sign out
                </PButton>
              </form>
            ) : (
              <PLinkButton href="/login" tone="terra">
                Sign in
              </PLinkButton>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
