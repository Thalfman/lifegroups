import Link from "next/link";
import type { CSSProperties } from "react";
import { getCurrentSession } from "@/lib/auth/session";
import { defaultLandingPathForRole } from "@/lib/auth/roles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { POrnament, PSeal } from "@/components/pastoral/atoms";

export const dynamic = "force-dynamic";

const pillPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: P.ink,
  color: P.surface,
  padding: "14px 28px",
  borderRadius: 999,
  fontSize: 14,
  fontFamily: fontSans,
  fontWeight: 600,
  textDecoration: "none",
  border: "none",
};

export default async function HomePage() {
  const session = await getCurrentSession();
  const dashboardHref = session?.profile
    ? defaultLandingPathForRole(session.profile.role)
    : null;
  const ctaHref = dashboardHref ?? "/login";
  const ctaLabel = dashboardHref ? "Open your dashboard" : "Sign in";

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
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.3,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(58,42,26,0.06) 1px, transparent 0)",
          backgroundSize: "4px 4px",
          pointerEvents: "none",
        }}
      />

      <header
        style={{
          padding: "18px clamp(20px, 5vw, 36px)",
          background: P.surface,
          borderBottom: `1px solid ${P.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
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
        <Link href={ctaHref} style={{ ...pillPrimary, padding: "10px 20px", fontSize: 13 }}>
          {ctaLabel}
        </Link>
      </header>

      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <POrnament w={100} />
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: "clamp(36px, 7vw, 64px)",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              margin: "20px 0 22px",
              fontWeight: 600,
              color: P.ink,
            }}
          >
            Fox Valley Church Life Groups
          </h1>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: "clamp(16px, 2vw, 19px)",
              lineHeight: 1.55,
              color: P.ink2,
              margin: "0 auto 36px",
              maxWidth: 560,
            }}
          >
            Supporting Life Groups as they care for people and build meaningful
            relationships.
          </p>
          <Link href={ctaHref} style={pillPrimary}>
            {ctaLabel}
          </Link>
        </div>
      </main>

      <footer
        style={{
          padding: "20px clamp(20px, 5vw, 36px)",
          background: P.surface,
          borderTop: `1px solid ${P.line}`,
          textAlign: "center",
          fontFamily: fontSans,
          fontSize: 12,
          color: P.ink3,
          letterSpacing: 0.5,
          position: "relative",
          zIndex: 1,
        }}
      >
        © Fox Valley Church Life Groups
      </footer>
    </div>
  );
}
