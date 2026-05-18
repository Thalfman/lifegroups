import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { POrnament, PSeal } from "@/components/pastoral/atoms";
import { PButton, PLinkButton } from "@/components/pastoral/button";
import { logoutAction } from "@/app/(protected)/actions";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UnauthorizedPage() {
  const session = await getCurrentSession();
  const hasLinkedProfile = !!session?.profile;
  const isSignedIn = !!session;

  return (
    <div
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
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 600,
              color: P.ink,
            }}
          >
            Fox Valley ·{" "}
            <span style={{ fontStyle: "italic", color: P.ink2, fontWeight: 400 }}>
              Life Groups
            </span>
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
            Access not available
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: "clamp(28px, 4vw, 38px)",
              margin: 0,
              fontWeight: 500,
              letterSpacing: -1,
              lineHeight: 1.05,
              color: P.ink,
            }}
          >
            Not quite{" "}
            <span style={{ fontStyle: "italic", color: P.terra }}>through</span>{" "}
            yet.
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
            Your account doesn&apos;t have access to that dashboard.
            {isSignedIn && !hasLinkedProfile
              ? " Your sign-in succeeded, but your auth user isn't linked to a ministry profile yet — please ask a ministry admin to link your account."
              : " If you think this is wrong, contact a ministry admin."}
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
