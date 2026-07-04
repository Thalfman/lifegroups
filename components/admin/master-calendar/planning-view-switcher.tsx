import {
  PLANNING_VIEWS,
  type PlanningViewKey,
} from "@/lib/admin/planning-views";
import { pillButtonClassName } from "./filter-styles";

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
    <div className="grid gap-2">
      <div
        role="group"
        aria-label="Quick filters"
        className="inline-flex flex-wrap gap-0.5 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {PLANNING_VIEWS.map((view) => (
          <button
            key={view.key}
            type="button"
            aria-pressed={value === view.key}
            onClick={() => onChange(view.key)}
            className={pillButtonClassName(value === view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="font-sans text-xs text-ink3">
        {counts.hasActiveFilters
          ? `${counts.shown} of ${counts.total} in this view`
          : `${counts.total} ${counts.total === 1 ? "meeting" : "meetings"} in this view`}
      </div>
    </div>
  );
}
