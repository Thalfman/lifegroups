import { ministryYearOf } from "@/lib/admin/ministry-year";

// The Multiply area's tab keys. Defined here (not in the "use client" shell) so
// both the shell and the server page can import them without a client boundary.
export type MultiplyTabKey = "plan" | "readiness" | "leaders";

// The current ministry year for the Multiply surface. In the Jun/Jul off-season
// there is no active ministry year; the surface then plans for the year whose
// August is next (the current calendar year), so it is never blank in summer.
export function currentMinistryYear(now: Date): number {
  const located = ministryYearOf(now);
  return located.year ?? now.getUTCFullYear();
}

const MULTIPLY_TAB_KEYS: readonly MultiplyTabKey[] = [
  "plan",
  "readiness",
  "leaders",
];

// Resolve the Multiply tab the page should open on from a `?tab=` query param.
// Defaults to "plan" (Julian's working view) for an absent or unrecognized
// value, so a Readiness-grid cell can deep-link with `?tab=plan` and any other
// caller still lands somewhere coherent. Pure, so the server page can call it.
export function resolveMultiplyInitialTab(
  param: string | string[] | undefined
): MultiplyTabKey {
  const raw = Array.isArray(param) ? param[0] : param;
  return MULTIPLY_TAB_KEYS.find((k) => k === raw) ?? "plan";
}
