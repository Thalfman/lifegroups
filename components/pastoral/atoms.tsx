import type { CSSProperties, ReactNode } from "react";
import { P, fontDisplay, fontSans } from "@/lib/pastoral";

export type PTone = "neutral" | "healthy" | "watch" | "followup" | "pause";

const BADGE_TONES: Record<PTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: P.line2, fg: P.ink2, dot: P.ink3 },
  healthy: { bg: P.sageSoft, fg: "#3e4f29", dot: P.sage },
  watch: { bg: P.mustardSoft, fg: "#7c5a1f", dot: P.mustard },
  followup: { bg: P.terraSoft, fg: "#7d3621", dot: P.terra },
  pause: { bg: "#e2dfd3", fg: "#5c5848", dot: "#8a8166" },
};

export function PBadge({
  tone = "neutral",
  outline = false,
  children,
}: {
  tone?: PTone;
  outline?: boolean;
  children: ReactNode;
}) {
  const t = BADGE_TONES[tone];
  if (outline) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          borderRadius: 999,
          border: `1px solid ${t.dot}`,
          color: t.fg,
          fontSize: 11,
          fontFamily: fontSans,
          fontWeight: 500,
          background: "transparent",
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 5, height: 5, borderRadius: 99, background: t.dot }}
        />
        {children}
      </span>
    );
  }
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
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: 99, background: t.dot }}
      />
      {children}
    </span>
  );
}

export function PSeal({ size = 32 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
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
        fontSize="10"
        fontWeight="700"
        letterSpacing="0.5"
      >
        FVC
      </text>
    </svg>
  );
}

export function POrnament({
  w = 80,
  color = P.terra,
}: {
  w?: number;
  color?: string;
} = {}) {
  return (
    <svg width={w} height="14" viewBox="0 0 80 14" aria-hidden="true">
      <line x1="0" y1="7" x2="30" y2="7" stroke={color} strokeWidth="0.8" />
      <circle cx="40" cy="7" r="3" fill="none" stroke={color} strokeWidth="0.8" />
      <circle cx="40" cy="7" r="1" fill={color} />
      <line x1="50" y1="7" x2="80" y2="7" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

export type PAvatarTone = "terra" | "sage" | "mustard" | "neutral";

export function PAvatar({
  name,
  size = 36,
  tone = "terra",
  style,
}: {
  name: string;
  size?: number;
  tone?: PAvatarTone;
  style?: CSSProperties;
}) {
  const bg =
    tone === "terra"
      ? P.terraSoft
      : tone === "sage"
        ? P.sageSoft
        : tone === "mustard"
          ? P.mustardSoft
          : P.line2;
  const fg =
    tone === "terra"
      ? P.terra
      : tone === "sage"
        ? P.sage
        : tone === "mustard"
          ? P.mustard
          : P.ink2;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: bg,
        display: "grid",
        placeItems: "center",
        fontSize: Math.max(10, Math.round(size * 0.32)),
        fontFamily: fontDisplay,
        fontWeight: 600,
        color: fg,
        flexShrink: 0,
        ...style,
      }}
    >
      {initials || "·"}
    </div>
  );
}
