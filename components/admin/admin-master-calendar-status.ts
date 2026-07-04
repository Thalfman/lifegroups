import type { PTone } from "@/components/pastoral/atoms";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// Single source of truth for the status stripe hue used by the month-view
// pill border (admin-master-calendar-grid.tsx) and the legend swatches
// (admin-calendar-legend.tsx) — one map per CSS property so the two surfaces
// can't drift. The "OFF week" grey maps to the decorative ink step (non-text
// use only).
export const STATUS_STRIPE_BORDER_CLASS: Record<
  MasterOccurrence["status"],
  string
> = {
  scheduled: "border-sage",
  cancelled: "border-clay",
  off: "border-ink4",
};

export const STATUS_STRIPE_BG_CLASS: Record<
  MasterOccurrence["status"],
  string
> = {
  scheduled: "bg-sage",
  cancelled: "bg-clay",
  off: "bg-ink4",
};

// Single source of truth for the badge tone an occurrence's status maps to,
// shared by the month grid, the list, the drawer, and the by-leader list so the
// status hue can't drift per surface.
export function occurrenceStatusTone(
  status: MasterOccurrence["status"]
): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
}
