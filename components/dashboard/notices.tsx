import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontMono, fontSans } from "@/lib/pastoral";

type NoticeTone = "sage" | "mustard" | "terra" | "ink";

function tonePalette(tone: NoticeTone) {
  if (tone === "sage") return { accent: P.sage, bg: P.sageSoft, fg: "#3e4f29" };
  if (tone === "terra")
    return { accent: P.terra, bg: P.terraSoft, fg: "#7d3621" };
  if (tone === "ink")
    return { accent: P.ink2, bg: "#e2dfd3", fg: "#3a2a1a" };
  return { accent: P.mustard, bg: P.mustardSoft, fg: "#7c5a1f" };
}

function Notice({
  tone,
  children,
  style,
}: {
  tone: NoticeTone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const t = tonePalette(tone);
  return (
    <div
      role="status"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${t.accent}`,
        borderRadius: 10,
        padding: "12px 16px",
        fontFamily: fontBody,
        fontSize: 13,
        color: P.ink2,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ConfiguredDataNotice({ style }: { style?: CSSProperties }) {
  return (
    <Notice tone="sage" style={style}>
      Reading live data from Supabase, scoped by Row Level Security to your role.
    </Notice>
  );
}

export function ReadOnlyDataNotice({ style }: { style?: CSSProperties }) {
  return (
    <Notice tone="ink" style={style}>
      Ministry-wide read-only view. No write actions are wired up in this phase.
    </Notice>
  );
}

const codeStyle: CSSProperties = {
  fontFamily: fontMono,
  fontSize: 12,
  background: P.bg,
  padding: "1px 6px",
  borderRadius: 4,
  color: P.ink,
};

export function FallbackDataNotice({ style }: { style?: CSSProperties }) {
  return (
    <Notice tone="mustard" style={style}>
      Showing fallback demo content. Set{" "}
      <code style={codeStyle}>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code style={codeStyle}>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to read
      live data.
    </Notice>
  );
}

export function PublicPreviewNotice({ style }: { style?: CSSProperties }) {
  return (
    <Notice tone="mustard" style={style}>
      Public design preview — demo data only.{" "}
      <Link
        href="/login"
        style={{
          color: P.terra,
          fontFamily: fontSans,
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        Sign in
      </Link>{" "}
      to see your real ministry data.
    </Notice>
  );
}

export function DashboardErrorNotice({
  message,
  style,
}: {
  message: string;
  style?: CSSProperties;
}) {
  return (
    <Notice tone="terra" style={style}>
      Supabase read failed; falling back to demo data.{" "}
      <span
        style={{
          fontFamily: fontMono,
          fontSize: 11.5,
          opacity: 0.8,
          color: P.ink2,
        }}
      >
        {message}
      </span>
    </Notice>
  );
}
