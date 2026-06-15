import { P, fontBody, fontSans } from "@/lib/pastoral";

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        padding: "6px 10px",
        background: P.bg,
        display: "grid",
        gap: 4,
        alignSelf: "start",
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          background: P.surface,
          color: P.ink,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          padding: "6px 8px",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
