// A chip carries its filter `category` (the field it came from) so two values
// that share a label across fields stay distinguishable. The master calendar
// deliberately exposes "OFF" and "Cancelled" in BOTH the gathering-type and
// status filters, so a value-only chip ("Remove filter: Cancelled") collides
// between fields — both visually and in its accessible name. Folding the
// category in keeps each chip's name unique (the repeated-control-context
// invariant this surface enforces).
export type ActiveChip = {
  key: string;
  category: string;
  label: string;
  onRemove: () => void;
};

// Compact, removable chips summarising every active filter selection
// (Calendar polish, PRD req 11, #262). Each chip drops a single selection;
// the FilterBar's "Reset filters" still clears everything at once. Keeping the
// active set visible (and individually removable) means the admin never has to
// re-open a collapsed field to remember — or undo — one choice.
export function ActiveFilterChips({ chips }: { chips: ActiveChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-pill border border-clay bg-claySoft py-0.5 pl-2.5 pr-1 font-sans text-[11.5px] text-clay"
        >
          <span className="font-sans text-[9px] font-bold uppercase tracking-[0.6px] opacity-75">
            {chip.category}
          </span>
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.category} filter: ${chip.label}`}
            className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-pill border-none bg-transparent p-0 text-sm leading-none text-clay"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
