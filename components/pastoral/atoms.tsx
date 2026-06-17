import type { CSSProperties, ReactNode } from "react";
import { P, fontDisplay } from "@/lib/pastoral";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PTone = "neutral" | "healthy" | "watch" | "followup" | "pause";

// Compatibility wrapper over the design-system Badge — one tone map carries
// the whole status vocabulary (sage = well · amber = watch · clay = needs
// follow-up).
const TONE_TO_BADGE: Record<PTone, BadgeTone> = {
  neutral: "neutral",
  healthy: "sage",
  watch: "amber",
  followup: "clay",
  pause: "ghost",
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
  const badgeTone = TONE_TO_BADGE[tone];
  return (
    <Badge
      tone={badgeTone}
      dot
      className={cn(
        outline &&
          "border border-current bg-transparent [&>span:first-child]:bg-current"
      )}
    >
      {children}
    </Badge>
  );
}

export function PSeal({ size = 32 }: { size?: number } = {}) {
  // CSS vars aren't valid in SVG presentation attributes, so fill/stroke go
  // through `style` now that P.* resolve to var(--c-*).
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" style={{ fill: P.terra }} />
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="none"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        style={{ stroke: P.surface }}
      />
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontFamily={fontDisplay}
        fontSize="10"
        fontWeight="700"
        letterSpacing="0.5"
        style={{ fill: P.surface }}
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
      <line
        x1="0"
        y1="7"
        x2="30"
        y2="7"
        strokeWidth="0.8"
        style={{ stroke: color }}
      />
      <circle
        cx="40"
        cy="7"
        r="3"
        fill="none"
        strokeWidth="0.8"
        style={{ stroke: color }}
      />
      <circle cx="40" cy="7" r="1" style={{ fill: color }} />
      <line
        x1="50"
        y1="7"
        x2="80"
        y2="7"
        strokeWidth="0.8"
        style={{ stroke: color }}
      />
    </svg>
  );
}

export type PAvatarTone = "terra" | "sage" | "mustard" | "neutral";

const PAVATAR_TONES: Record<PAvatarTone, { bg: string; fg: string }> = {
  terra: { bg: P.terraSoft, fg: P.terra },
  sage: { bg: P.sageSoft, fg: P.sage },
  mustard: { bg: P.mustardSoft, fg: P.mustard },
  neutral: { bg: P.line2, fg: P.ink2 },
};

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
  const { bg, fg } = PAVATAR_TONES[tone];
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
