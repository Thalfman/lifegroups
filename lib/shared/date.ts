// Shared ISO date helpers. Inputs are always `YYYY-MM-DD` strings — the
// SQL `date` shape we use across follow-ups, care, calendar, etc. We
// avoid `new Date(iso)` because it tunnels through the local timezone
// and shifts the calendar day in zones west of UTC. Parsing the parts
// manually + constructing a UTC date keeps the rendered day stable
// regardless of where the page is rendered.

const MONTH_DAY_YEAR: Intl.DateTimeFormatOptions = {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
};

/**
 * Format an ISO `YYYY-MM-DD` date string as "Mon D, YYYY" (en-US),
 * resolved in UTC so the rendered day matches the stored calendar day.
 * Returns the input unchanged when it doesn't parse — callers handle
 * the `null` / empty-string cases upstream.
 */
export function formatIsoDate(value: string): string {
  const [y, m, d] = value.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    "en-US",
    MONTH_DAY_YEAR,
  );
}

/**
 * Convenience wrapper for nullable date columns. Returns the supplied
 * fallback (default `"—"`) when the input is `null` / `undefined`.
 */
export function formatIsoDateOr(
  value: string | null | undefined,
  fallback = "—",
): string {
  if (value === null || value === undefined) return fallback;
  return formatIsoDate(value);
}
