import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { POrnament, PSeal } from "@/components/pastoral/atoms";
import { LoginForm } from "./login-form";
import { isSafeNextPath } from "./next-path";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && isSafeNextPath(nextValue) ? nextValue : null;
  const configured = isSupabaseConfigured();

  return (
    <div
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
            <div>
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                }}
              >
                Fox Valley Church
              </div>
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 10,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: P.ink2,
                  marginTop: 2,
                }}
              >
                Life Groups
              </div>
            </div>
          </Link>

          <div style={{ maxWidth: 520 }}>
            <POrnament w={100} />
            <h2
              style={{
                fontFamily: fontDisplay,
                fontSize: "clamp(34px, 5vw, 48px)",
                lineHeight: 1.05,
                margin: "20px 0 18px",
                fontWeight: 500,
                letterSpacing: -1,
                color: P.ink,
              }}
            >
              Come back in.{" "}
              <span style={{ fontStyle: "italic", color: P.terra }}>
                Your people are here.
              </span>
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
              One sign-in shows your assigned groups, the week&apos;s check-in,
              and any follow-ups admins have routed your way.
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
                fontSize: "clamp(26px, 4vw, 32px)",
                margin: "0 0 18px",
                fontWeight: 500,
                letterSpacing: -0.5,
                color: P.ink,
              }}
            >
              Welcome back to your dashboard.
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
              Ministry admins, staff, and life group leaders.
            </p>

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
                Authentication is not configured on this deployment. Set the
                Supabase environment variables to enable sign-in.
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
                fontStyle: "italic",
                lineHeight: 1.55,
              }}
            >
              Not a user yet? Ask a ministry admin to invite you, or browse the{" "}
              <Link
                href="/admin-preview"
                style={{
                  color: P.terra,
                  fontFamily: fontSans,
                  fontStyle: "normal",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                admin
              </Link>{" "}
              and{" "}
              <Link
                href="/leader-preview"
                style={{
                  color: P.terra,
                  fontFamily: fontSans,
                  fontStyle: "normal",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                leader
              </Link>{" "}
              design previews.
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
