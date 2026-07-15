// Shared temporal micro-rules for the care surfaces. Pure; no I/O.
//
// Two rules were each written in two places and could drift:
//   * the "days-from-today → human label" spec ("Due today", "Overdue 3 days",
//     "Due in 5 days") lived as relativeDayLabel in shepherd-care-dashboard.ts
//     and, char-for-char, as the tail of dueLabelFor in care-area.ts;
//   * the "later of two ISO dates" floor lived as laterIso in
//     shepherd-care-attention.ts and was re-derived inline as a nested ternary
//     in the dashboard summary.
//
// One home, so the Dashboard's "Due Soon" and the Directory's triage queue can't
// disagree about wording or about what "overdue" means.

// Human label for a due date expressed as whole days from today: negative is
// overdue, 0 is today, positive is upcoming. The single definition of the care
// due-label wording.
export function formatDueLabel(daysFromToday: number): string {
  if (daysFromToday === 0) return "Due today";
  if (daysFromToday < 0) {
    const abs = Math.abs(daysFromToday);
    return abs === 1 ? "Overdue 1 day" : `Overdue ${abs} days`;
  }
  return daysFromToday === 1 ? "Due tomorrow" : `Due in ${daysFromToday} days`;
}

// The single overdue-boundary rule shared by the care follow-ups
// (lib/admin/shepherd-care-follow-ups.ts) and the general follow-up queue
// (lib/admin/follow-up-queue.ts): a dated item is overdue only when its due
// date is strictly before the caller's church-local todayIso (churchTodayIso,
// lib/shared/church-time). Lexicographic compare is date order for
// YYYY-MM-DD, so no Date parsing — and no timezone — can creep in here.
export function isOverdueIso(
  dueDateIso: string | null,
  todayIso: string
): boolean {
  return dueDateIso !== null && dueDateIso < todayIso;
}

// The later of two ISO YYYY-MM-DD dates (lexicographic compare is date order),
// treating null as "absent". Returns null only when both are null. Used to floor
// a staleness clock at the later of real last-contact and a reset baseline.
export function laterIso(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}
