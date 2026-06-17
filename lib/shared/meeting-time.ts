// Shared meeting-time formatting. `meeting_time` columns are stored as
// `HH:MM[:SS]` strings; we render a compact 12-hour form (e.g. `7:30p`)
// without tunnelling through `Date`/local timezone. `meetingLine` joins a
// meeting day with that time into a single label.

/**
 * Format a `HH:MM[:SS]` meeting time as a compact 12-hour label
 * (e.g. `19:30` → `7:30p`). Returns `null` for empty input and the input
 * unchanged when it doesn't parse.
 */
export function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

/**
 * Combine a meeting day and time into one `Day · Time` label, dropping
 * whichever side is absent. Returns `null` when both are absent.
 */
export function meetingLine(
  day: string | null,
  time: string | null
): string | null {
  const t = formatMeetingTime(time);
  const d = day?.trim() ?? null;
  if (d && t) return `${d} · ${t}`;
  if (d) return d;
  if (t) return t;
  return null;
}
