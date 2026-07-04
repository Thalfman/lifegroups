import { cn } from "@/lib/utils";

// A single selectable filter option rendered as a checkbox styled like a pill.
// Shared by the Groups disclosure and the generic multi-checkbox field so both
// render identical option markup; the caller supplies the `id`/`name`/`value`
// it already computes (the slug folds in #371's collision-safe tokens) and is
// notified of the toggle's next checked state.
export function CheckboxPill({
  id,
  name,
  value,
  label,
  checked,
  onToggle,
}: {
  id: string;
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-pill border px-2.5 py-1 font-sans text-xs",
        checked
          ? "border-clay bg-claySoft text-clay"
          : "border-line bg-surface text-ink2"
      )}
    >
      <input
        id={id}
        name={name}
        value={value}
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="m-0 accent-clay"
      />
      {label}
    </label>
  );
}
