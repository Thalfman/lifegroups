import { P } from "@/lib/pastoral";
import type { PTone } from "@/components/pastoral/atoms";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// Single source of truth for the status color used by the month-view
// pill border (admin-master-calendar-grid.tsx) and the legend swatches
// (admin-calendar-legend.tsx). The "OFF week" grey maps to the
// decorative ink step (non-text use only).
export const STATUS_STRIPE_OFF = "var(--c-ink4)";

export function statusStripeColor(status: MasterOccurrence["status"]): string {
  if (status === "off") return STATUS_STRIPE_OFF;
  if (status === "cancelled") return P.terra;
  return P.sage;
}

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
