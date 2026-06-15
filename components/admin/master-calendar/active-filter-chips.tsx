import { P, fontBody, fontSans } from "@/lib/pastoral";

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
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: fontBody,
            fontSize: 11.5,
            color: P.terra,
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 999,
            padding: "2px 4px 2px 10px",
          }}
        >
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 9,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.75,
            }}
          >
            {chip.category}
          </span>
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.category} filter: ${chip.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: P.terra,
              fontSize: 13,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
