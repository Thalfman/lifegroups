import Image from "next/image";
import { LoginForm } from "@/app/login/login-form";

export function SignInScreen({
  next,
  resetOk,
}: {
  next: string | null;
  resetOk: boolean;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "var(--c-bg)",
        color: "var(--c-ink)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <Image
            src="/logo.png"
            width={40}
            height={40}
            alt=""
            priority
            style={{ display: "block" }}
          />
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 500,
              color: "var(--c-ink)",
              marginTop: 10,
            }}
          >
            Life Groups
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1.8px",
              color: "var(--c-ink3)",
              marginTop: 4,
            }}
          >
            Fox Valley Church
          </div>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "-0.3px",
            color: "var(--c-ink)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Welcome back.{" "}
          <em style={{ fontStyle: "italic", color: "var(--c-ink2)" }}>
            Let&rsquo;s shepherd well.
          </em>
        </h1>

        <div
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: 14,
            padding: 28,
            boxShadow: "var(--c-shadow)",
          }}
        >
          <LoginForm next={next} resetOk={resetOk} />
        </div>

        <aside
          style={{
            borderLeft: "2px solid var(--c-sage)",
            padding: "16px 18px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--c-ink2)",
              margin: 0,
              textWrap: "pretty",
            }}
          >
            &ldquo;Jesus Christ is the one we proclaim, admonishing and teaching
            everyone with all wisdom, so that we may present everyone fully
            mature in Christ.&rdquo;
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1.6px",
              color: "var(--c-ink3)",
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            Colossians 1:28
          </p>
        </aside>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--c-ink3)",
            textAlign: "center",
            margin: 0,
          }}
        >
          New leader?{" "}
          <a
            href="mailto:ministry@foxvalleychurch.org"
            style={{
              color: "var(--c-sageDeep)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Email the ministry team.
          </a>
        </p>
      </div>
    </main>
  );
}
