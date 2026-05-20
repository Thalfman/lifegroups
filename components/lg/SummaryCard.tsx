import type { ReactNode } from "react";

export type SummaryCardTone = "sage" | "rose" | "amber" | "clay" | "neutral" | "blue";

const TONE_COLOR: Record<SummaryCardTone, string> = {
  sage: "var(--c-sage)",
  rose: "var(--c-rose)",
  amber: "oklch(0.55 0.13 70)",
  clay: "var(--c-clay)",
  neutral: "var(--c-ink3)",
  blue: "var(--c-blue)",
};

export function SummaryCard({
  label,
  value,
  hint,
  trend,
  tone = "sage",
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  trend?: ReactNode;
  tone?: SummaryCardTone;
}) {
  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-line)",
        borderRadius: 12,
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 12,
          bottom: 12,
          width: 2,
          background: TONE_COLOR[tone],
          borderRadius: "0 2px 2px 0",
        }}
      />
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 34,
            fontWeight: 400,
            color: "var(--c-ink)",
            letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {hint ? (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11.5,
              color: "var(--c-ink3)",
            }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {trend ? (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--c-ink3)",
          }}
        >
          {trend}
        </div>
      ) : null}
    </div>
  );
}
