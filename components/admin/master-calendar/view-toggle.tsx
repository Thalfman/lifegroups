import type { CalendarViewMode } from "@/lib/admin/master-calendar-view";
import { pillButtonClassName } from "./filter-styles";

type ViewMode = CalendarViewMode;

export function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="inline-flex self-start rounded-pill border border-line bg-surface p-[3px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "month"}
        onClick={() => onChange("month")}
        className={pillButtonClassName(viewMode === "month")}
      >
        Month
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "list"}
        onClick={() => onChange("list")}
        className={pillButtonClassName(viewMode === "list")}
      >
        List
      </button>
    </div>
  );
}
