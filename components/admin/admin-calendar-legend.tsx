"use client";

import { P, fontSans } from "@/lib/pastoral";

// Mirror of the status → left-stripe color mapping in
// admin-master-calendar-grid.tsx (OccurrencePill borderLeft). If that
// mapping changes, update this swatch set so the legend keeps telling
// the truth about what each color means.
const SWATCHES: { label: string; color: string }[] = [
  { label: "Scheduled", color: P.sage },
  { label: "Cancelled", color: P.terra },
  { label: "OFF week", color: "#8a8166" },
];

export function AdminCalendarLegend() {
  return (
    <div
      aria-label="Calendar status legend"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "6px 14px",
        fontFamily: fontSans,
        fontSize: 11,
        color: P.ink3,
      }}
    >
      <span
        style={{
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 600,
          color: P.ink3,
        }}
      >
        Legend
      </span>
      {SWATCHES.map((s) => (
        <span
          key={s.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: P.ink2,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 3,
              height: 14,
              background: s.color,
              borderRadius: 2,
            }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
