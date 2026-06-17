import { monthBounds } from "@/lib/calendar/occurrences";
import { firstParam } from "@/lib/shared/search-params";

// Validate a `?month=` searchParam down to a usable `YYYY-MM` string, or null.
// Collapses a repeated param to its first value, rejects anything that isn't the
// `YYYY-MM` shape, and confirms the month resolves to real bounds. Shared by the
// Planning surface and its frozen aliases (admin/calendar, launch-planning).
export function pickMonthParam(
  value: string | string[] | undefined
): string | null {
  const raw = firstParam(value);
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return monthBounds(raw) ? raw : null;
}
