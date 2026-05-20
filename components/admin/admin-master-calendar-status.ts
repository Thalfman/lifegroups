import { P } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// Single source of truth for the left-stripe color used by the
// month-view pill (admin-master-calendar-grid.tsx), the list-view
// occurrence card (admin-master-calendar-list.tsx), and the legend
// swatches (admin-calendar-legend.tsx). The "OFF week" warm grey is
// kept here as a literal because it is not part of the lib/pastoral
// palette and does not warrant a global token addition for one
// route.
export const STATUS_STRIPE_OFF = "#8a8166";

export function statusStripeColor(status: MasterOccurrence["status"]): string {
  if (status === "off") return STATUS_STRIPE_OFF;
  if (status === "cancelled") return P.terra;
  return P.sage;
}
