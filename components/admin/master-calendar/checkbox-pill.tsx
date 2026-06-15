import { P, fontBody } from "@/lib/pastoral";

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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontFamily: fontBody,
        fontSize: 12,
        color: checked ? P.terra : P.ink2,
        background: checked ? P.terraSoft : P.surface,
        border: `1px solid ${checked ? P.terra : P.line}`,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        id={id}
        name={name}
        value={value}
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ accentColor: P.terra, margin: 0 }}
      />
      {label}
    </label>
  );
}
