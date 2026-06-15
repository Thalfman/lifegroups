import { useId, useMemo } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { slugify, visuallyHidden } from "./filter-helpers";
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
    <details
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        background: P.bg,
        padding: "6px 10px",
        alignSelf: "start",
        margin: 0,
      }}
    >
      <summary
        style={{
          display: "list-item",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 700,
            }}
          >
            Groups
          </span>
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              color: count > 0 ? P.terra : P.ink3,
              background: count > 0 ? P.terraSoft : "transparent",
              border: `1px solid ${count > 0 ? P.terra : P.line}`,
              padding: "1px 8px",
              borderRadius: 999,
            }}
          >
            {summaryRight}
          </span>
        </div>
      </summary>
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend style={visuallyHidden}>Groups</legend>
        <div style={{ paddingTop: 8 }}>
          <BulkActions
            label="groups"
            all={options.map((o) => o.value)}
            value={value}
            onChange={onChange}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            paddingTop: 8,
            maxHeight: 220,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
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
