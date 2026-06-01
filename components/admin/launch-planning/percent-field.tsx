"use client";

import { useState, type ReactNode } from "react";
import { P, fontBody } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import { percentToRatio, ratioToPercent } from "@/lib/admin/launch-planning";

const hintStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  margin: "4px 0 0",
  lineHeight: 1.4,
} as const;

// L5 (#224): a 0–1 ratio rendered and edited as a whole-number percentage. The
// visible box carries the percentage; a hidden input named `name` carries the
// ratio the server stores, kept in sync on every keystroke. Storage stays a
// ratio — the percent⇄ratio conversion happens entirely here at the UI boundary,
// so no migration is needed and the server validator's bounds (0–1 / 0–0.95)
// still apply to the ratio it receives.
export function PercentField({
  id,
  name,
  label,
  defaultRatio,
  hint,
  required = false,
  // 100 for participation (ratio ≤ 1); 95 for the launch buffer (ratio ≤ 0.95).
  maxPercent = 100,
}: {
  id: string;
  name: string;
  label: string;
  defaultRatio: number;
  hint: ReactNode;
  required?: boolean;
  maxPercent?: number;
}) {
  const [percent, setPercent] = useState<string>(ratioToPercent(defaultRatio));
  // Until the operator actually edits the field, submit the EXACT stored ratio
  // rather than a value round-tripped through the (display-rounded) percentage —
  // otherwise a no-op save (e.g. editing notes) would silently rewrite a precise
  // stored ratio like 0.6255 down to 0.625.
  const [edited, setEdited] = useState(false);
  const ratio = edited ? percentToRatio(percent) : String(defaultRatio);

  return (
    <div>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        // "decimal" (not "numeric") so mobile shows a decimal-point key — a
        // pre-filled fractional percent like 62.5 must remain editable.
        inputMode="decimal"
        min={0}
        max={maxPercent}
        // "any" (not 1) so a stored fractional ratio like 0.625 — which
        // ratioToPercent renders as 62.5 — still passes the browser's step
        // constraint and can be saved without being force-rounded first.
        step="any"
        required={required}
        value={percent}
        onChange={(e) => {
          setPercent(e.target.value);
          setEdited(true);
        }}
        style={fieldInputStyle}
      />
      {/* The ratio the server reads: the untouched stored value, or the
          percent box converted back once the operator edits it. */}
      <input type="hidden" name={name} value={ratio} />
      <p style={hintStyle}>{hint}</p>
    </div>
  );
}
