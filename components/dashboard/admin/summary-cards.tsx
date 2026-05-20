import type { ReactNode } from "react";
import type { AdminSummary } from "@/lib/dashboard/types";

type Tone = "sage" | "rose" | "amber" | "clay" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  sage: "var(--c-sage)",
  rose: "var(--c-rose)",
  amber: "var(--c-amberAccent)",
  clay: "var(--c-clay)",
  neutral: "var(--c-ink3)",
};

function plural(n: number, s: string, p: string): string {
  return n === 1 ? s : p;
}

export function SummaryCards({ summary }: { summary: AdminSummary }) {
  const submittedHint =
    summary.activeGroupCount === 0 ? "no active groups" : `of ${summary.activeGroupCount}`;
  const missingHint =
    summary.missingCheckIns === 0
      ? "all in for the week"
      : `${plural(summary.missingCheckIns, "group hasn't", "groups haven't")} checked in`;
  const followUpHint =
    summary.needsFollowUp === 0 ? "quiet week" : "from leader pulse";
  const capacityHint = summary.capacityWatch === 0 ? "below thresholds" : "near/at capacity";
  const unknownHint =
    summary.unknownCapacity === 0 ? "every group has one" : "set a ceiling";

  const tiles: { label: string; value: number; hint: string; tone: Tone }[] = [
    { label: "Active groups", value: summary.activeGroupCount, hint: "open in the directory", tone: "sage" },
    { label: "Submitted check-ins", value: summary.submittedCheckIns, hint: submittedHint, tone: "sage" },
    { label: "Missing check-ins", value: summary.missingCheckIns, hint: missingHint, tone: summary.missingCheckIns > 0 ? "rose" : "neutral" },
    { label: "Needs follow-up", value: summary.needsFollowUp, hint: followUpHint, tone: summary.needsFollowUp > 0 ? "amber" : "neutral" },
    { label: "Capacity watch", value: summary.capacityWatch, hint: capacityHint, tone: summary.capacityWatch > 0 ? "clay" : "neutral" },
    { label: "Unknown capacity", value: summary.unknownCapacity, hint: unknownHint, tone: "neutral" },
  ];

  return (
    <section
      aria-labelledby="weekly-overview"
      className="lg-m-summary-grid"
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      }}
    >
      <h2 id="weekly-overview" className="sr-only">
        Weekly overview
      </h2>
      {tiles.map((t) => (
        <SummaryTile key={t.label} {...t} />
      ))}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: number;
  hint?: ReactNode;
  tone: Tone;
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
      <span
        aria-hidden="true"
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
    </div>
  );
}
