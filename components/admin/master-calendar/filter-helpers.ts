import type { CSSProperties } from "react";

// Slugify a label/value into a DOM-safe, human-readable token for checkbox
// `id`/`value` attributes (#371): "Anderson Life Group" → "anderson-life-group".
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Visually-hidden style for a fieldset's <legend> that names the group for
// assistive tech without duplicating an adjacent visible label (#371).
export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
