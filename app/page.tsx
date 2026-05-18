import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getCurrentSession } from "@/lib/auth/session";
import { defaultLandingPathForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const P = {
  bg: "#f5ecd9",
  bgDeep: "#ede0c4",
  surface: "#fbf6e8",
  ink: "#3a2a1a",
  ink2: "#6b5641",
  ink3: "#9c8a6d",
  line: "#e3d4af",
  line2: "#ebe0c2",
  terra: "#b85a3c",
  terraSoft: "#f2d7c8",
  sage: "#6a7d4f",
  sageSoft: "#dfe4ce",
  mustard: "#c8964a",
  mustardSoft: "#f0dfb5",
};

const fontDisplay = "var(--font-display)";
const fontBody = "var(--font-body)";
const fontSans = "var(--font-sans)";
const fontMono = "var(--font-mono)";

type Tone = "neutral" | "healthy" | "watch" | "followup" | "pause";

const BADGE_TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: P.line2, fg: P.ink2, dot: P.ink3 },
  healthy: { bg: P.sageSoft, fg: "#3e4f29", dot: P.sage },
  watch: { bg: P.mustardSoft, fg: "#7c5a1f", dot: P.mustard },
  followup: { bg: P.terraSoft, fg: "#7d3621", dot: P.terra },
  pause: { bg: "#e2dfd3", fg: "#5c5848", dot: "#8a8166" },
};

function PBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontFamily: fontSans,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: t.dot }} />
      {children}
    </span>
  );
}

function PSeal() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill={P.terra} />
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="none"
        stroke={P.surface}
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fill={P.surface}
        fontFamily={fontDisplay}
        fontSize="13"
        fontWeight="600"
        fontStyle="italic"
      >
        fv
      </text>
    </svg>
  );
}

function POrnament({ w = 80, color = P.terra }: { w?: number; color?: string }) {
  return (
    <svg width={w} height="14" viewBox="0 0 80 14" aria-hidden="true">
      <line x1="0" y1="7" x2="30" y2="7" stroke={color} strokeWidth="0.8" />
      <circle cx="40" cy="7" r="3" fill="none" stroke={color} strokeWidth="0.8" />
      <circle cx="40" cy="7" r="1" fill={color} />
      <line x1="50" y1="7" x2="80" y2="7" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

const pillPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: P.ink,
  color: P.surface,
  padding: "14px 26px",
  borderRadius: 999,
  fontSize: 14,
  fontFamily: fontSans,
  fontWeight: 500,
  textDecoration: "none",
  border: "none",
};

const pillSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: P.ink,
  padding: "14px 26px",
  borderRadius: 999,
  fontSize: 14,
  fontFamily: fontSans,
  fontWeight: 500,
  textDecoration: "none",
  border: `1px solid ${P.ink}`,
};

const headerPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: P.terra,
  color: P.surface,
  padding: "10px 20px",
  borderRadius: 999,
  fontSize: 13,
  fontFamily: fontSans,
  fontWeight: 500,
  letterSpacing: 0.2,
  textDecoration: "none",
  border: "none",
};

const METRICS = [
  { k: "Active groups", v: "28", c: P.sage },
  { k: "Attendance", v: "247", c: P.terra },
  { k: "Guests", v: "14", c: P.mustard },
  { k: "Missing", v: "3", c: P.ink },
];

const PILLARS = [
  {
    n: "I.",
    t: "A weekly home",
    d: "Leaders open the app once a week. Roster, pulse, guests — done in two minutes from anywhere.",
  },
  {
    n: "II.",
    t: "Sight of the whole",
    d: "Pastors see every group on a single page. Health, capacity, restarts — surfaced before they're problems.",
  },
  {
    n: "III.",
    t: "Hospitality, kept",
    d: "A gentle pipeline from first visit to placed in a group. No guest forgotten between Sundays.",
  },
];

const ROSTER = [
  "Mark Anderson",
  "Lisa Anderson",
  "Anne Holloway",
  "Bryan H.",
  "Cara Diaz",
  "Tom Briggs",
];

export default async function HomePage() {
  const session = await getCurrentSession();
  const dashboardHref = session?.profile
    ? defaultLandingPathForRole(session.profile.role)
    : null;
  const primaryCtaHref = dashboardHref ?? "/login";
  const primaryCtaLabel = dashboardHref ? "Open my dashboard" : "Sign in to your dashboard";
  const headerCtaLabel = dashboardHref ? "Open dashboard" : "Sign in";

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
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(58,42,26,0.06) 1px, transparent 0)",
          backgroundSize: "4px 4px",
          pointerEvents: "none",
        }}
      />

      <header
        style={{
          padding: "24px 64px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
        </div>
        <div
          style={{
            display: "flex",
            gap: 32,
            alignItems: "center",
            fontSize: 14,
            fontFamily: fontBody,
            color: P.ink2,
            fontStyle: "italic",
          }}
        >
          <Link href="/admin-preview" style={{ color: "inherit", textDecoration: "none" }}>
            Admin preview
          </Link>
          <Link href="/leader-preview" style={{ color: "inherit", textDecoration: "none" }}>
            Leader preview
          </Link>
          <Link href={primaryCtaHref} style={headerPill}>
            {headerCtaLabel}
          </Link>
        </div>
      </header>

      <section style={{ padding: "56px 64px 72px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <POrnament w={120} />
          </div>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 600,
              margin: "18px 0 22px",
            }}
          >
            Est. 2026 · A ministry tool
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: 88,
              lineHeight: 0.98,
              letterSpacing: -2.5,
              margin: "0 auto",
              fontWeight: 400,
              color: P.ink,
              maxWidth: 980,
            }}
          >
            <span style={{ fontStyle: "italic", fontWeight: 500 }}>Tending</span> the Life Groups
            <br />
            where Fox Valley{" "}
            <span style={{ fontStyle: "italic", fontWeight: 500, color: P.terra }}>
              becomes a family.
            </span>
          </h1>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: P.ink2,
              margin: "28px auto 0",
              maxWidth: 580,
              fontFamily: fontBody,
            }}
          >
            Weekly check-ins for leaders. Health and capacity at a glance for admins. A simple,
            gentle home for the people-work of life groups.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 36, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={primaryCtaHref} style={pillPrimary}>
              {primaryCtaLabel}
            </Link>
            <Link href="/admin-preview" style={pillSecondary}>
              See a demo
            </Link>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 20,
            padding: 8,
            boxShadow:
              "0 1px 0 #fff inset, 0 30px 60px -30px rgba(58,42,26,0.18)",
          }}
        >
          <div
            style={{
              background: P.bgDeep,
              borderRadius: 14,
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 99, background: P.terra, opacity: 0.5 }} />
              <div style={{ width: 10, height: 10, borderRadius: 99, background: P.mustard, opacity: 0.5 }} />
              <div style={{ width: 10, height: 10, borderRadius: 99, background: P.sage, opacity: 0.5 }} />
            </div>
            <div style={{ fontFamily: fontMono, fontSize: 11, color: P.ink3 }}>
              fox-valley-church · admin
            </div>
          </div>
          <div style={{ padding: "28px 32px 36px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: 24,
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: P.ink3,
                    marginBottom: 6,
                  }}
                >
                  Week of May 11
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 32,
                    fontWeight: 500,
                    letterSpacing: -0.6,
                  }}
                >
                  Good morning, Avery.
                </div>
              </div>
              <PBadge tone="healthy">Week in good shape</PBadge>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {METRICS.map((m) => (
                <div
                  key={m.k}
                  style={{
                    background: P.bg,
                    borderRadius: 12,
                    padding: "16px 18px",
                    border: `1px solid ${P.line2}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      color: P.ink3,
                      marginBottom: 8,
                    }}
                  >
                    {m.k}
                  </div>
                  <div
                    style={{
                      fontFamily: fontDisplay,
                      fontSize: 38,
                      fontWeight: 500,
                      letterSpacing: -1,
                      color: m.c,
                      lineHeight: 1,
                    }}
                  >
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1080,
            margin: "80px auto 0",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: P.line,
            border: `1px solid ${P.line}`,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {PILLARS.map((c) => (
            <div key={c.n} style={{ background: P.surface, padding: "36px 32px" }}>
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 13,
                  fontStyle: "italic",
                  color: P.terra,
                  marginBottom: 18,
                  letterSpacing: 1,
                }}
              >
                {c.n}
              </div>
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 24,
                  fontWeight: 500,
                  letterSpacing: -0.4,
                  marginBottom: 10,
                  lineHeight: 1.15,
                }}
              >
                {c.t}
              </div>
              <div
                style={{
                  fontSize: 14.5,
                  color: P.ink2,
                  lineHeight: 1.6,
                  fontFamily: fontBody,
                }}
              >
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          padding: "72px 64px 100px",
          background: P.bgDeep,
          borderTop: `1px solid ${P.line}`,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div>
            <POrnament />
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: P.terra,
                fontWeight: 600,
                marginTop: 16,
                marginBottom: 14,
              }}
            >
              For our leaders
            </div>
            <h2
              style={{
                fontFamily: fontDisplay,
                fontSize: 48,
                lineHeight: 1.04,
                margin: 0,
                fontWeight: 500,
                letterSpacing: -1.2,
              }}
            >
              Two minutes <span style={{ fontStyle: "italic", color: P.terra }}>on the couch</span>
              , after group.
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.65,
                color: P.ink2,
                marginTop: 18,
                maxWidth: 480,
                fontFamily: fontBody,
              }}
            >
              Mark who was there. Note who you&apos;d like to follow up with. Drop in a sentence
              about how the night felt. That&apos;s it — we&apos;ll keep the rest in order.
            </p>
            <div style={{ display: "flex", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
              <PBadge tone="healthy">Healthy</PBadge>
              <PBadge tone="watch">Watch</PBadge>
              <PBadge tone="followup">Needs follow-up</PBadge>
              <PBadge tone="pause">Planned pause</PBadge>
              <PBadge tone="neutral">Active</PBadge>
            </div>
          </div>
          <div
            style={{
              justifySelf: "center",
              width: 300,
              background: P.ink,
              borderRadius: 36,
              padding: 10,
              boxShadow: "0 40px 80px -30px rgba(58,42,26,0.4)",
            }}
          >
            <div
              style={{
                background: P.bg,
                borderRadius: 28,
                padding: "24px 20px",
                minHeight: 520,
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: P.ink3,
                    marginBottom: 4,
                  }}
                >
                  Week of May 11
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: -0.4,
                  }}
                >
                  The Anderson Home
                </div>
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    color: P.ink2,
                    fontStyle: "italic",
                    marginTop: 4,
                  }}
                >
                  Tuesday · 6:30 PM
                </div>
              </div>
              <div
                style={{
                  background: P.surface,
                  borderRadius: 14,
                  padding: 14,
                  border: `1px solid ${P.line2}`,
                }}
              >
                {ROSTER.map((n, i) => (
                  <div
                    key={n}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 0",
                      borderBottom: i < ROSTER.length - 1 ? `1px solid ${P.line2}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: fontBody }}>{n}</span>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        background: i < ROSTER.length - 1 ? P.terra : "transparent",
                        border: i < ROSTER.length - 1 ? "none" : `1.5px solid ${P.line}`,
                        display: "grid",
                        placeItems: "center",
                        color: "#fff",
                        fontSize: 11,
                      }}
                    >
                      {i < ROSTER.length - 1 ? "✓" : ""}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                style={{
                  width: "100%",
                  marginTop: 16,
                  background: P.terra,
                  color: P.surface,
                  border: "none",
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontFamily: fontSans,
                  fontWeight: 500,
                }}
              >
                Submit check-in
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer
        style={{
          padding: "40px 64px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          background: P.surface,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontFamily: fontBody,
            fontStyle: "italic",
            color: P.ink2,
            fontSize: 14,
          }}
        >
          &ldquo;Bear with one another in love.&rdquo; — Eph. 4:2
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            color: P.ink3,
            letterSpacing: 1,
          }}
        >
          © Fox Valley Church · 2026
        </div>
      </footer>
    </div>
  );
}
