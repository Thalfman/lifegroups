// Slugify a label/value into a DOM-safe, human-readable token for checkbox
// `id`/`value` attributes (#371): "Anderson Life Group" → "anderson-life-group".
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
