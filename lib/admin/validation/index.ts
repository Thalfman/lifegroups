// Barrel for the admin write-validation contracts (see ADR-0012). Validators
// stay centralized and shared, clustered by domain; callers import them from
// "@/lib/admin/validation" unchanged.
export type { ValidationResult } from "./shared";
// isRecord / normalizeUuid are re-exported for tests and Phase 5A.1 callers that
// need canonical comparisons.
export { isRecord, normalizeUuid } from "./shared";
export * from "./groups";
export * from "./people";
export * from "./guests";
export * from "./prospects";
export * from "./follow-ups";
export * from "./settings";
export * from "./super-admin";
export * from "./invite-link";
export * from "./shepherd-care";
export * from "./care-notes";
export * from "./launch-planning";
export * from "./group-health";
export * from "./health-rubric";
export * from "./multiplication-pillars";
export * from "./leader-health";
export * from "./group-rubric-grade";
export * from "./leader-pipeline";
