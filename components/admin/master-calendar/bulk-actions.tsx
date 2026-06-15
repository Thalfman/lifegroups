import type { CSSProperties } from "react";
import { P, fontSans } from "@/lib/pastoral";

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
  const btnStyle = (disabled: boolean): CSSProperties => ({
    fontFamily: fontSans,
    fontSize: 10,
    letterSpacing: 0.4,
    fontWeight: 700,
    textTransform: "uppercase",
    color: disabled ? P.ink3 : P.terra,
    background: "transparent",
    border: "none",
    padding: "2px 4px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => onChange([...all])}
        disabled={allSelected}
        aria-label={`Select all ${label}`}
        style={btnStyle(allSelected)}
      >
        Select all
      </button>
      <span aria-hidden style={{ color: P.line, fontSize: 10 }}>
        ·
      </span>
      <button
        type="button"
        onClick={() => onChange([])}
        disabled={noneSelected}
        aria-label={`Clear all ${label}`}
        style={btnStyle(noneSelected)}
      >
        Clear all
      </button>
    </div>
  );
}
