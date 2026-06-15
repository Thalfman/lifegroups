import { useMemo } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  calendarFilterSummarySegments,
  type CalendarFilters,
} from "@/lib/admin/master-calendar-view";
import type { PlanningViewKey } from "@/lib/admin/planning-views";
import type { MasterCalendarLeader } from "@/lib/admin/master-calendar";
import { P, fontBody } from "@/lib/pastoral";

// A compact, plain-language summary of WHY the current list is filtered (#371),
// sitting between the filters and the meeting list with a one-tap "Clear
// filters" reset. Each dimension reads "All <thing>" when unfiltered, or the
// chosen value(s) when narrowed, so an admin can tell at a glance what the view
// is showing without re-opening the advanced panel.
export function ActiveFilterSummary({
  planningView,
  filters,
  leaderOptions,
  active,
  onClear,
}: {
  planningView: PlanningViewKey;
  filters: CalendarFilters;
  leaderOptions: MasterCalendarLeader[];
  active: boolean;
  onClear: () => void;
}) {
  const parts = useMemo(
    () =>
      calendarFilterSummarySegments({ planningView, filters, leaderOptions }),
    [planningView, filters, leaderOptions]
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div
        aria-live="polite"
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          minWidth: 0,
        }}
      >
        <span style={{ color: P.ink3, fontWeight: 600 }}>Showing: </span>
        {parts.join(" · ")}
      </div>
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={onClear}
        disabled={!active}
      >
        Clear filters
      </PButton>
    </div>
  );
}
