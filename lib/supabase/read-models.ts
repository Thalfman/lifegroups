import {
  currentUtcDateIso,
  differenceInDaysIso,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Shared low-level read primitives live in ./read-core so the shepherd-care
// slice and the rest of read-models can both use them without an import cycle.
// Re-exported here so existing importers of these names from read-models keep
// working unchanged.
export { currentUtcDateIso, differenceInDaysIso };
export type { ReadResult, ReadClient };

// The shepherd-care + over-shepherd/coverage read cluster lives in its own
// module. Re-exported wholesale so every name that used to be importable from
// read-models stays importable from here.
export * from "./shepherd-care-reads";

// The Care Note / Prayer Request reads (#381) and the follow-up reads (Phase
// 5C.0) live in their own focused modules. Re-exported wholesale so every name
// stays importable from read-models unchanged — this barrel is now a thinner
// re-export of focused read modules rather than their sole home.
export * from "./care-note-reads";
export * from "./follow-up-reads";

// The remaining read domains (groups, memberships/members/profiles, guests,
// attendance, health, calendar, executive overview, multiplication, and
// settings/launch-planning) live in their own focused *-reads modules. Each is
// re-exported wholesale so every name stays importable from read-models
// unchanged — this barrel composes the focused read modules rather than owning
// their bodies.
export * from "./group-reads";
export * from "./membership-reads";
export * from "./guest-reads";
export * from "./attendance-reads";
export * from "./health-reads";
export * from "./calendar-reads";
export * from "./overview-reads";
export * from "./multiplication-reads";
export * from "./settings-reads";
