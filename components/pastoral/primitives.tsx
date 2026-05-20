// Life Groups Prototype primitives — Pill, Card, Button, Avatar, SectionLabel,
// SidebarIcon. These match the design from `Life Groups Prototype.html` and
// consume tokens via CSS variables (`var(--c-*)`). Existing PBadge/PCard/
// PButton/PAvatar in this folder remain valid for older callers.

import type { CSSProperties, ReactNode } from "react";

export type PillTone =
  | "neutral"
  | "sage"
  | "clay"
  | "amber"
  | "rose"
  | "blue"
  | "ghost";

const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: "var(--c-surfaceAlt)", fg: "var(--c-ink2)", bd: "var(--c-line)" },
  sage: { bg: "var(--c-sageSoft)", fg: "var(--c-sageDeep)", bd: "transparent" },
  clay: { bg: "var(--c-claySoft)", fg: "var(--c-clay)", bd: "transparent" },
  amber: { bg: "var(--c-amberSoft)", fg: "var(--c-amberDeep)", bd: "transparent" },
  rose: { bg: "var(--c-roseSoft)", fg: "var(--c-rose)", bd: "transparent" },
  blue: { bg: "var(--c-blueSoft)", fg: "var(--c-blue)", bd: "transparent" },
  ghost: { bg: "transparent", fg: "var(--c-ink3)", bd: "var(--c-line)" },
};

export function Pill({
  children,
  tone = "neutral",
  size = "sm",
}: {
  children: ReactNode;
  tone?: PillTone;
  size?: "sm" | "lg";
}) {
  const t = PILL_TONES[tone];
  const padding = size === "lg" ? "4px 10px" : "2px 8px";
  const fs = size === "lg" ? 11.5 : 10.5;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding,
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontFamily: "var(--font-body)",
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-line)",
        borderRadius: 14,
        padding: padded ? "var(--space-card)" : 0,
        boxShadow: "var(--c-shadow)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type LgButtonTone = "sage" | "clay" | "ghost" | "quiet";

const BUTTON_TONES: Record<LgButtonTone, { bg: string; fg: string; bd: string }> = {
  sage: { bg: "var(--c-sage)", fg: "var(--c-onSage)", bd: "var(--c-sage)" },
  clay: { bg: "var(--c-clay)", fg: "var(--c-onSage)", bd: "var(--c-clay)" },
  ghost: { bg: "var(--c-surface)", fg: "var(--c-ink)", bd: "var(--c-line)" },
  quiet: { bg: "transparent", fg: "var(--c-ink2)", bd: "var(--c-line)" },
};

export function LgButton({
  children,
  tone = "sage",
  size = "md",
  onClick,
  style,
  type = "button",
}: {
  children: ReactNode;
  tone?: LgButtonTone;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
}) {
  const t = BUTTON_TONES[tone];
  const pad = size === "lg" ? "11px 18px" : size === "sm" ? "5px 10px" : "8px 14px";
  const fs = size === "lg" ? 14 : size === "sm" ? 12 : 13;
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: pad,
        borderRadius: 8,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontFamily: "var(--font-body)",
        fontSize: fs,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: 0.1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export type LgAvatarTone = "sage" | "clay" | "amber" | "blue";

const AVATAR_TONES: Record<LgAvatarTone, { bg: string; fg: string }> = {
  sage: { bg: "var(--c-sageSoft)", fg: "var(--c-sageDeep)" },
  clay: { bg: "var(--c-claySoft)", fg: "var(--c-clay)" },
  amber: { bg: "var(--c-amberSoft)", fg: "var(--c-amberDeep)" },
  blue: { bg: "var(--c-blueSoft)", fg: "var(--c-blue)" },
};

export function LgAvatar({
  name,
  size = 28,
  tone = "sage",
}: {
  name: string;
  size?: number;
  tone?: LgAvatarTone;
}) {
  const initials = (name.trim() || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const t = AVATAR_TONES[tone];
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: t.bg,
        color: t.fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-body)",
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: 0.4,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function SectionLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.8,
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {children}
      </div>
      {hint ? (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--c-ink3)",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// Health pulse → visual treatment. Mirrors the prototype's helper.
export function healthTone(pulse: string | null | undefined): {
  tone: PillTone;
  label: string;
} {
  switch (pulse) {
    case "healthy":
      return { tone: "sage", label: "Healthy" };
    case "watch":
      return { tone: "amber", label: "Watch" };
    case "needs_follow_up":
      return { tone: "rose", label: "Needs follow-up" };
    case "submitted":
      return { tone: "sage", label: "Submitted" };
    case "missing":
      return { tone: "rose", label: "Missing" };
    case "did_not_meet":
      return { tone: "neutral", label: "Did not meet" };
    case "planned_pause":
      return { tone: "blue", label: "Planned pause" };
    case "unknown":
      return { tone: "ghost", label: "Unknown" };
    default:
      return { tone: "neutral", label: pulse || "—" };
  }
}
