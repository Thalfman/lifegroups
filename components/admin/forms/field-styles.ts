// Design-system form classes (docs/design-direction.md §4 Forms). Every form
// surface styles through these Tailwind utility strings; the legacy
// CSSProperties twins were retired with issue #847 once the last inline-style
// surfaces migrated.

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
