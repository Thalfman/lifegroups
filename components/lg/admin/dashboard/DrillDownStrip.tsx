import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export type DrillDownItem = {
  label: string;
  count: number;
  href: string;
  // When true the count is a sampled minimum (e.g. capped read) and renders
  // as "N+" so it never understates without overclaiming.
  plus?: boolean;
  // Accent for the count when there's something to act on.
  tone?: string;
};

function DrillDownTile({ label, count, href, plus, tone }: DrillDownItem) {
  const active = count > 0;
  const valueColor = active ? (tone ?? P.terra) : P.ink3;
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <span
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.3,
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: fontDisplay,
            fontSize: 30,
            lineHeight: 1,
            color: valueColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
          {plus && count > 0 ? "+" : ""}
        </span>
        <span style={{ fontFamily: fontBody, fontSize: 12.5, color: P.ink3 }}>
          {active ? "review →" : "all clear"}
        </span>
      </span>
    </Link>
  );
}

// High-level drill-down row. Replaces the on-page operational lists (attention
// queue, setup gaps, follow-ups) with compact counts that link into the deep
// pages, keeping the landing purely executive.
export function DrillDownStrip({ items }: { items: DrillDownItem[] }) {
  return (
    <div
      className="lg-shell-grid-4"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <DrillDownTile key={it.label} {...it} />
      ))}
    </div>
  );
}
