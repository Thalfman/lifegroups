import Link from "next/link";
import Image from "next/image";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div aria-hidden="true" style={paperGrain} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              lineHeight: 1.1,
            }}
          >
            <Image
              src="/logo.png"
              alt="Fox Valley Church"
              width={40}
              height={40}
              priority
              style={{
                width: 40,
                height: 40,
                objectFit: "contain",
                display: "block",
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.1,
              }}
            >
              <span
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 18,
                  fontWeight: 500,
                  color: P.ink,
                }}
              >
                Life Groups
              </span>
              <span
                style={{
                  fontFamily: fontSans,
                  fontSize: 10.5,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: P.ink3,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                Fox Valley Church
              </span>
            </div>
          </div>
        </div>

        <h2
          style={{
            margin: 0,
            textAlign: "center",
            fontFamily: fontDisplay,
            fontSize: 30,
            lineHeight: 1.15,
            fontWeight: 400,
            color: P.ink,
            letterSpacing: -0.3,
          }}
        >
          Welcome back.{" "}
          <span style={{ fontStyle: "italic", color: P.ink2 }}>
            Let&rsquo;s shepherd well.
          </span>
        </h2>

        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: 28,
            boxShadow:
              "0 1px 2px rgba(60,45,30,0.04), 0 4px 14px rgba(60,45,30,0.04)",
          }}
        >
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
                marginBottom: 14,
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
                marginBottom: 14,
              }}
            >
              Authentication is not configured on this deployment.
              Configure the authentication backend to enable sign-in.
            </div>
          ) : null}

          <LoginForm next={next} />
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderLeft: `2px solid ${P.sage}`,
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 14,
              lineHeight: 1.6,
              fontStyle: "italic",
              color: P.ink2,
              textWrap: "pretty",
            }}
          >
            &ldquo;Jesus Christ is the one we proclaim, admonishing and
            teaching everyone with all wisdom, so that we may present everyone
            fully mature in Christ.&rdquo;
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: fontSans,
              fontSize: 10.5,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            Colossians 1:28
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink3,
          }}
        >
          New leader?{" "}
          <a
            href="mailto:ministry@foxvalleychurch.org"
            style={{
              color: P.sageTextStrong,
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Email the ministry team.
          </a>
        </div>
      </div>
    </div>
  );
}
