import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { POrnament, PSeal } from "@/components/pastoral/atoms";
import { LoginForm } from "./login-form";
import { isSafeNextPath } from "./next-path";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[]; reset?: string | string[] }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && isSafeNextPath(nextValue) ? nextValue : null;
  const resetRaw = params.reset;
  const resetValue = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  const showResetSuccess = resetValue === "ok";
  const configured = isSupabaseConfigured();

  return (
    <div
      className="lg-m-noscrollx"
      style={{
        background: P.bg,
        minHeight: "100vh",
        fontFamily: fontBody,
        color: P.ink,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div aria-hidden="true" style={paperGrain} />

      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          position: "relative",
          zIndex: 1,
        }}
        className="login-grid"
      >
        <aside
          style={{
            padding: "clamp(32px, 6vw, 56px) clamp(24px, 6vw, 64px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 40,
            background: P.surface,
            borderRight: `1px solid ${P.line}`,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <PSeal />
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: -0.2,
              }}
            >
              Fox Valley Church Life Groups
            </div>
          </Link>

          <div style={{ maxWidth: 520 }}>
            <POrnament w={100} />
            <h2
              style={{
                fontFamily: fontDisplay,
                fontSize: "clamp(32px, 4.5vw, 44px)",
                lineHeight: 1.1,
                margin: "20px 0 18px",
                fontWeight: 600,
                letterSpacing: -0.5,
                color: P.ink,
              }}
            >
              Welcome back.
            </h2>
            <p
              style={{
                fontSize: 16,
                color: P.ink2,
                lineHeight: 1.65,
                fontFamily: fontBody,
                margin: 0,
              }}
            >
              Supporting Life Groups as they care for people and build
              meaningful relationships.
            </p>
          </div>

          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              fontStyle: "italic",
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            &ldquo;As iron sharpens iron, so one person sharpens another.&rdquo;
            — Prov. 27:17
          </div>
        </aside>

        <section
          style={{
            padding: "clamp(32px, 6vw, 56px) clamp(24px, 6vw, 64px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: 400 }}>
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
              Sign in
            </div>
            <h3
              style={{
                fontFamily: fontDisplay,
                fontSize: "clamp(24px, 3.5vw, 28px)",
                margin: "0 0 14px",
                fontWeight: 600,
                letterSpacing: -0.3,
                color: P.ink,
              }}
            >
              Sign in
            </h3>
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
              For ministry admins and Life Group leaders.
            </p>

            {showResetSuccess ? (
              <div
                role="status"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.line}`,
                  borderLeft: `3px solid ${P.sage}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  lineHeight: 1.5,
                  marginBottom: 18,
                }}
              >
                Password updated. Sign in.
              </div>
            ) : null}

            {!configured ? (
              <div
                role="status"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.line}`,
                  borderLeft: `3px solid ${P.mustard}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  lineHeight: 1.5,
                  marginBottom: 18,
                }}
              >
                Authentication is not configured on this deployment.
                Configure the authentication backend to enable sign-in.
              </div>
            ) : null}

            <LoginForm next={next} />

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
              Not a user yet? Ask a ministry admin to invite you.
              <br />
              <Link
                href="/forgot-password"
                style={{
                  color: P.terra,
                  fontFamily: fontSans,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </Link>
            </p>
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .login-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
