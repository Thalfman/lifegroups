import type { CSSProperties, ReactNode } from "react";

export type PillTone =
  | "neutral"
  | "sage"
  | "clay"
  | "amber"
  | "rose"
  | "blue"
  | "ghost";

const TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: "var(--c-surfaceAlt)", fg: "var(--c-ink2)", bd: "var(--c-line)" },
  sage: { bg: "var(--c-sageSoft)", fg: "var(--c-sageDeep)", bd: "transparent" },
  clay: { bg: "var(--c-claySoft)", fg: "var(--c-clay)", bd: "transparent" },
  amber: { bg: "var(--c-amberSoft)", fg: "oklch(0.45 0.13 70)", bd: "transparent" },
  rose: { bg: "var(--c-roseSoft)", fg: "var(--c-rose)", bd: "transparent" },
  blue: { bg: "var(--c-blueSoft)", fg: "var(--c-blue)", bd: "transparent" },
  ghost: { bg: "transparent", fg: "var(--c-ink3)", bd: "var(--c-line)" },
};

export function Pill({
  children,
  tone = "neutral",
  size = "sm",
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  size?: "sm" | "lg";
  style?: CSSProperties;
}) {
  const t = TONES[tone];
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
        ...style,
      }}
    >
      {children}
    </span>
  );
}
