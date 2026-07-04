import { cn } from "@/lib/utils";

// Compact "Select all / Clear all" pair for a multi-select filter field
// (Calendar polish, PRD req 11, #262). Each button disables itself once it
// would be a no-op (all already chosen / nothing chosen) so the affordance
// also doubles as a hint at the field's current state.
export function BulkActions<V>({
  label,
  all,
  value,
  onChange,
}: {
  label: string;
  all: V[];
  value: V[];
  onChange: (next: V[]) => void;
}) {
  // Membership, not length-equality: a stale value in `value` (e.g. a group id
  // retained after the groups prop shrank) could match `all.length` while a
  // currently-listed option stays unchecked, wrongly disabling "Select all".
  const allSelected = all.length > 0 && all.every((v) => value.includes(v));
  const noneSelected = value.length === 0;
  const btnClassName = (disabled: boolean): string =>
    cn(
      "border-none bg-transparent px-1 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.4px]",
      disabled
        ? "cursor-default text-ink3 opacity-45"
        : "cursor-pointer text-clay"
    );
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange([...all])}
        disabled={allSelected}
        aria-label={`Select all ${label}`}
        className={btnClassName(allSelected)}
      >
        Select all
      </button>
      <span aria-hidden className="text-[10px] text-line">
        ·
      </span>
      <button
        type="button"
        onClick={() => onChange([])}
        disabled={noneSelected}
        aria-label={`Clear all ${label}`}
        className={btnClassName(noneSelected)}
      >
        Clear all
      </button>
    </div>
  );
}
