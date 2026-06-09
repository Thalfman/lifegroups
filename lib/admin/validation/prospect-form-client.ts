// Client-side, inline-field validation copy for the Add-prospect form
// (components/admin/plan/prospect-create-form). Kept pure and UI-free so the
// empty-name case is unit-testable in the node-env Vitest setup without jsdom,
// and so the message has a single source of truth shared by the component.
//
// This is the field-facing companion to the server write-validation contract in
// ./prospects.ts (validateCreateProspectPayload). The server stays the authority
// on the wire; this only mirrors the native `required` gate as a friendlier,
// field-anchored message. It is intentionally NOT exported from the validation
// barrel (index.ts), which is reserved for server write-validation contracts.

export const FULL_NAME_REQUIRED_MESSAGE = "Full name is required.";

export type ProspectFormClientErrors = { fullName?: string };

// Mirrors the native `required` gate on the Full name field as a pure value, so
// the rule (empty / whitespace-only is invalid) and the message can be asserted
// directly. Trims to match the server validator's trim-then-check behavior.
export function prospectFormClientErrors(input: {
  fullName: string;
}): ProspectFormClientErrors {
  const errors: ProspectFormClientErrors = {};
  if (input.fullName.trim().length === 0) {
    errors.fullName = FULL_NAME_REQUIRED_MESSAGE;
  }
  return errors;
}
