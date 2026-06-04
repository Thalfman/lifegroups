// Accessible-name builder for master-calendar occurrence triggers (#322).
//
// Pure and client-safe (no supabase imports — unlike master-calendar.ts), so
// both the list and the month-grid render the SAME explicit, meaningful name
// from one source rather than duplicating the run-on-text fix inline.
//
// The name leads with the group, then the date (unique across a recurring
// group's dates), then status/type + clock. Group names are NOT unique in this
// app, so when the group has leaders the name also carries a "led by …"
// discriminator — that keeps two same-named groups meeting on the same date
// with the same type/time/status distinct for screen readers, which the bare
// group name alone would collapse into one indistinguishable label.

import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// The "led by …" discriminator, or "" when the group has no leaders. Group
// names are not unique, so this is what keeps two same-named groups meeting on
// the same date distinct in any per-occurrence accessible name.
function leaderDiscriminator(occurrence: MasterOccurrence): string {
  const leaderNames = occurrence.leaders.map((l) => l.name).join(", ");
  return leaderNames ? `led by ${leaderNames}` : "";
}

export function occurrenceAccessibleName(
  occurrence: MasterOccurrence,
  verb = "View"
): string {
  const statusOrType =
    occurrence.status === "scheduled"
      ? friendlyEventTypeLabel(occurrence.eventType)
      : friendlyEventStatusLabel(occurrence.status);
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const detailParts = [statusOrType];
  if (clock) detailParts.push(clock);
  const leaders = leaderDiscriminator(occurrence);
  if (leaders) detailParts.push(leaders);
  return `${verb} ${occurrence.groupName} on ${dateLabel(
    occurrence.date
  )} — ${detailParts.join(", ")}`;
}

// Accessible name for the list's "Open group calendar" deep-link. Same
// collision risk as the occurrence button (two same-named groups on one date),
// so it carries the date and the leader discriminator too.
export function occurrenceCalendarLinkName(
  occurrence: MasterOccurrence
): string {
  const parts = [dateLabel(occurrence.date)];
  const leaders = leaderDiscriminator(occurrence);
  if (leaders) parts.push(leaders);
  return `Open ${occurrence.groupName} calendar — ${parts.join(", ")}`;
}
