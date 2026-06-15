import { P } from "@/lib/pastoral";
import type { CalendarViewMode } from "@/lib/admin/master-calendar-view";
import { pillButtonStyle } from "./filter-styles";

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
      style={{
        display: "inline-flex",
        alignSelf: "start",
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
        padding: 3,
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "month"}
        onClick={() => onChange("month")}
        style={pillButtonStyle(viewMode === "month")}
      >
        Month
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "list"}
        onClick={() => onChange("list")}
        style={pillButtonStyle(viewMode === "list")}
      >
        List
      </button>
    </div>
  );
}
