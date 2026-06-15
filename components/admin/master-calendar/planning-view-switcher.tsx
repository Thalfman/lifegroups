import {
  PLANNING_VIEWS,
  type PlanningViewKey,
} from "@/lib/admin/planning-views";
import { P, fontBody } from "@/lib/pastoral";
import { pillButtonStyle } from "./filter-styles";

// The opinionated saved-view switcher (#331) — the PRIMARY affordance on
// /admin/planning. The quick filters are mutually-exclusive toggle buttons: each
// exposes its selected state with aria-pressed (#371), so a screen reader
// announces exactly one as pressed. (A tablist would imply per-tab tabpanels,
// which these filters don't have; toggle buttons are the accurate model.) The
// active view's occurrence count rides alongside so the director sees how many
// meetings the view surfaces.
export function PlanningViewSwitcher({
  value,
  onChange,
  counts,
}: {
  value: PlanningViewKey;
  onChange: (next: PlanningViewKey) => void;
  counts: { total: number; shown: number; hasActiveFilters: boolean };
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        role="group"
        aria-label="Quick filters"
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          alignSelf: "start",
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 999,
          padding: 3,
          gap: 2,
        }}
      >
        {PLANNING_VIEWS.map((view) => (
          <button
            key={view.key}
            type="button"
            aria-pressed={value === view.key}
            onClick={() => onChange(view.key)}
            style={pillButtonStyle(value === view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
        }}
      >
        {counts.hasActiveFilters
          ? `${counts.shown} of ${counts.total} in this view`
          : `${counts.total} ${counts.total === 1 ? "meeting" : "meetings"} in this view`}
      </div>
    </div>
  );
}
