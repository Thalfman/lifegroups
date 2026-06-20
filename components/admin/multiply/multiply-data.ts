import { ministryYearOf } from "@/lib/admin/ministry-year";

// The Multiply area's tab keys. Defined here (not in the "use client" shell) so
// both the shell and the server page can import them without a client boundary.
// ADR 0030: the working order leads with Readiness; the former "plan" tab is the
// "pipeline" tab now (label "Pipeline"). The "leaders" key is unchanged (ADR 0025
// keeps the code identity `leader`; its label reads "Shepherds").
export type MultiplyTabKey = "readiness" | "pipeline" | "leaders";

// The current ministry year for the Multiply surface. In the Jun/Jul off-season
// there is no active ministry year; the surface then plans for the year whose
// August is next (the current calendar year), so it is never blank in summer.
export function currentMinistryYear(now: Date): number {
  const located = ministryYearOf(now);
  return located.year ?? now.getUTCFullYear();
}

const MULTIPLY_TAB_KEYS: readonly MultiplyTabKey[] = [
  "readiness",
  "pipeline",
  "leaders",
];

// Resolve the Multiply tab the page should open on from a `?tab=` query param.
// ADR 0030: defaults to "readiness" (the at-a-glance landing signal) for an
// absent or unrecognized value, and accepts the legacy "plan" key as an alias
// that resolves to "pipeline" so old `?tab=plan` deep-links and bookmarks keep
// working. Pure, so the server page can call it.
export function resolveMultiplyInitialTab(
  param: string | string[] | undefined
): MultiplyTabKey {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw === "plan") return "pipeline";
  return MULTIPLY_TAB_KEYS.find((k) => k === raw) ?? "readiness";
}
