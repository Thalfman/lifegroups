// Shared count-aware noun pluralization. Produces "1 care note" /
// "2 care notes" style strings without re-rolling the `count === 1`
// ternary at every call site.

/**
 * Format a count with its noun, choosing the singular form when `count`
 * is exactly 1 and the plural form otherwise. The plural defaults to the
 * singular with a trailing `s`.
 *
 * @example pluralize(1, "care note") // "1 care note"
 * @example pluralize(2, "care note") // "2 care notes"
 * @example pluralize(2, "person", "people") // "2 people"
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
