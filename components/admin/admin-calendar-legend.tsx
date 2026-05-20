"use client";

import { P, fontSans } from "@/lib/pastoral";
import { statusStripeColor } from "./admin-master-calendar-status";

// Swatches are derived from the same statusStripeColor() helper the
// grid and list use, so the legend always tells the truth about what
// each colored bar means.
const SWATCHES: { label: string; color: string }[] = [
  { label: "Scheduled", color: statusStripeColor("scheduled") },
  { label: "Cancelled", color: statusStripeColor("cancelled") },
  { label: "OFF week", color: statusStripeColor("off") },
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
