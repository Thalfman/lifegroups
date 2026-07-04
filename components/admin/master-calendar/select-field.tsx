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
    <div className="grid gap-1 self-start rounded-sm border border-lineSoft bg-bg px-2.5 py-1.5">
      <div className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-ink3">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-[8px] border border-line bg-surface px-2 py-1.5 font-sans text-sm text-ink"
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
