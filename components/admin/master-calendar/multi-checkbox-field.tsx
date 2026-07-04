import { useId } from "react";
import { slugify } from "./filter-helpers";
import { BulkActions } from "./bulk-actions";
import { CheckboxPill } from "./checkbox-pill";

export function MultiCheckboxField<V extends string | number>({
  label,
  name,
  fieldKey,
  options,
  value,
  onChange,
}: {
  label: string;
  // Form-control `name` shared by every checkbox in the field (e.g. "status").
  name: string;
  // Stable per-field token folded into each checkbox `id` so ids stay readable
  // and don't collide across fields (#371).
  fieldKey: string;
  options: { value: V; label: string }[];
  value: V[];
  onChange: (next: V[]) => void;
}) {
  const uid = useId();
  return (
    <fieldset className="m-0 self-start rounded-sm border border-lineSoft bg-bg px-2.5 py-1.5">
      <legend className="px-1 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-ink3">
        {label}
      </legend>
      <BulkActions
        label={label}
        all={options.map((o) => o.value)}
        value={value}
        onChange={onChange}
      />
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-0.5 pt-1">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          const id = `${uid}${fieldKey}-${slugify(String(opt.value))}`;
          return (
            <CheckboxPill
              key={String(opt.value)}
              id={id}
              name={name}
              value={slugify(opt.label)}
              label={opt.label}
              checked={checked}
              onToggle={(next) => {
                if (next) onChange([...value, opt.value]);
                else onChange(value.filter((v) => v !== opt.value));
              }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
