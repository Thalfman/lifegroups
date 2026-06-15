import { useId } from "react";
import { P, fontSans } from "@/lib/pastoral";
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
    <fieldset
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        padding: "6px 10px",
        margin: 0,
        background: P.bg,
        alignSelf: "start",
      }}
    >
      <legend
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 700,
          padding: "0 4px",
        }}
      >
        {label}
      </legend>
      <BulkActions
        label={label}
        all={options.map((o) => o.value)}
        value={value}
        onChange={onChange}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          paddingTop: 4,
          maxHeight: 96,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
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
