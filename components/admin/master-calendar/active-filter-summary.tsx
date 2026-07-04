import { useMemo } from "react";
import {
  calendarFilterSummarySegments,
  type CalendarFilters,
} from "@/lib/admin/master-calendar-view";
import type { PlanningViewKey } from "@/lib/admin/planning-views";
import type { MasterCalendarLeader } from "@/lib/admin/master-calendar";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div
        aria-live="polite"
        className="min-w-0 font-sans text-[12.5px] text-ink2"
      >
        <span className="font-semibold text-ink3">Showing: </span>
        {parts.join(" · ")}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={!active}
      >
        Clear filters
      </Button>
    </div>
  );
}
