import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
  marginBottom: 6,
};

export const fieldInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${P.line}`,
  background: P.surface,
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  outline: "none",
  lineHeight: 1.4,
};

export const fieldSelectStyle: CSSProperties = {
  ...fieldInputStyle,
  appearance: "auto",
  background: P.surface,
};

export const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  alignItems: "end",
};

// Apply alongside `style={formGridStyle}` to collapse to a single column at
// ≤767px. (CSS in app/globals.css overrides the inline gridTemplateColumns
// with !important inside the mobile media query.)
export const formGridMobileClass = "lg-m-grid-stack";

// Apply on form inputs/textareas/selects to widen tap targets and set the
// font-size to 16px so iOS doesn't auto-zoom on focus.
export const fieldInputClass = "lg-m-input";

export const formNoteStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: "0 0 12px",
  lineHeight: 1.5,
};

export const errorTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.terraTextStrong,
  background: P.terraSoft,
  padding: "8px 12px",
  borderRadius: 6,
  margin: 0,
};

export const successTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.sageTextStrong,
  background: P.sageSoft,
  padding: "8px 12px",
  borderRadius: 6,
  margin: 0,
};

// Inline, per-field error message that sits directly under an input. Lighter
// than errorTextStyle (the form-summary block) — no background, smaller — so a
// single-field hint reads as a field annotation, not a form-level alert. Reuses
// the same terra ink for a consistent error voice.
export const fieldErrorStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.terraTextStrong,
  marginTop: 6,
  marginBottom: 0,
};

// ---------------------------------------------------------------------------
// Design-system form classes (docs/design-direction.md §4 Forms). Migrated
// surfaces use these Tailwind utility strings; the CSSProperties exports above
// remain only for surfaces that haven't migrated yet.
// ---------------------------------------------------------------------------

// Field label: tracked-uppercase survives in exactly this spot (12px, ink3).
// The bare text variant exists for labels that aren't the block above an
// input (e.g. a legend-like span inside a grid row).
export const fieldLabelTextClassName =
  "font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
export const fieldLabelClassName = `mb-1.5 block ${fieldLabelTextClassName}`;

// Input / textarea base: full width, 14px text, line border, rounded-sm,
// surface bg; the focus ring comes from the global standard in globals.css, and
// the global mobile guard holds every form control at 16px (no iOS zoom). This
// placeholder-free base lets primitives (`components/ui/input.tsx`) and the few
// surfaces that don't paint a placeholder compose the same field look without
// re-declaring the string locally.
export const fieldInputBaseClassName =
  "w-full rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink";

// Input / textarea: the base plus the muted placeholder ink. The canonical
// field-input class string imported across forms.
export const fieldInputClassName = `${fieldInputBaseClassName} placeholder:text-ink3`;

// Selects share the input look; native appearance stays.
export const fieldSelectClassName = fieldInputClassName;

// Form grid: mobile-first single column, two-up from md (≥768px).
export const formGridClassName =
  "grid grid-cols-1 items-end gap-3.5 md:grid-cols-2";

// Helper text adjacent to a field.
export const fieldHintClassName = "m-0 mt-1 font-sans text-sm text-ink3";

// Lede / instruction copy at the top of a form card.
export const formNoteClassName = "m-0 font-sans text-sm text-ink2";

// Form-level status lines: error in rose, confirmation in sage.
export const errorTextClassName =
  "m-0 rounded-sm bg-roseSoft px-3 py-2 font-sans text-sm text-rose";
export const successTextClassName =
  "m-0 rounded-sm bg-sageSoft px-3 py-2 font-sans text-sm text-sageDeep";

// Inline, per-field error message directly under an input.
export const fieldErrorClassName = "mb-0 mt-1.5 font-sans text-sm text-rose";
