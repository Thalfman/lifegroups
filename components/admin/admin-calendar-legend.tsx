"use client";

import { STATUS_STRIPE_BG_CLASS } from "./admin-master-calendar-status";

// The legend reads its swatch hues from the shared status-stripe map, so it
// always tells the truth about what each colored bar means.
const SWATCHES: { label: string; swatchClassName: string }[] = [
  { label: "Scheduled", swatchClassName: STATUS_STRIPE_BG_CLASS.scheduled },
  { label: "Cancelled", swatchClassName: STATUS_STRIPE_BG_CLASS.cancelled },
  { label: "OFF week", swatchClassName: STATUS_STRIPE_BG_CLASS.off },
];

export function AdminCalendarLegend() {
  return (
    <div
      aria-label="Calendar status legend"
      className="flex flex-wrap items-center gap-3.5 px-3.5 py-1.5 font-sans text-2xs text-ink3"
    >
      <span className="font-semibold uppercase tracking-[1.5px] text-ink3">
        Legend
      </span>
      {SWATCHES.map((s) => (
        <span
          key={s.label}
          className="inline-flex items-center gap-1.5 text-ink2"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-3.5 w-[3px] rounded-[2px] ${s.swatchClassName}`}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
