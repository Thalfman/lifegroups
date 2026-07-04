import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { slugify } from "./filter-helpers";
import { BulkActions } from "./bulk-actions";
import { CheckboxPill } from "./checkbox-pill";

export function GroupsDetailsField({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const uid = useId();
  const count = value.length;
  const selectedSet = useMemo(() => new Set(value), [value]);
  const summaryRight = count === 0 ? "All" : `${count} selected`;
  return (
    <details className="m-0 self-start rounded-sm border border-lineSoft bg-bg px-2.5 py-1.5">
      <summary className="list-item cursor-pointer px-0 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-ink3">
            Groups
          </span>
          <span
            className={cn(
              "rounded-pill border px-2 py-px font-sans text-2xs",
              count > 0
                ? "border-clay bg-claySoft text-clay"
                : "border-line bg-transparent text-ink3"
            )}
          >
            {summaryRight}
          </span>
        </div>
      </summary>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Groups</legend>
        <div className="pt-2">
          <BulkActions
            label="groups"
            all={options.map((o) => o.value)}
            value={value}
            onChange={onChange}
          />
        </div>
        <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto pr-0.5 pt-2">
          {options.map((opt) => {
            const checked = selectedSet.has(opt.value);
            const id = `${uid}group-${slugify(opt.value)}`;
            return (
              <CheckboxPill
                key={opt.value}
                id={id}
                name="groups"
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
    </details>
  );
}
