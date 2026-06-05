import type { ProspectState } from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import {
  normalizeAdditionalNote,
  normalizeNextStep,
} from "@/lib/admin/prospect-next-step";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  isEmail,
  isPhone,
  normalizeUuid,
} from "./shared";

// ---------------------------------------------------------------------------
// Interest Funnel — Prospect create + transition payloads (#375).
// ---------------------------------------------------------------------------

const PROSPECT_STATES: ReadonlySet<ProspectState> = new Set<ProspectState>([
  "interested",
  "matched",
  "joined",
  "not_at_this_time",
]);

function isProspectState(value: unknown): value is ProspectState {
  return (
    typeof value === "string" && PROSPECT_STATES.has(value as ProspectState)
  );
}

export type CreateProspectPayload = {
  full_name: string;
  email: string | null;
  phone: string | null;
};

export function validateCreateProspectPayload(
  input: unknown
): ValidationResult<CreateProspectPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const fullName = trimString(input.full_name) ?? "";
  const email = readOptionalString(input.email);
  const phone = readOptionalString(input.phone);

  if (fullName.length === 0) errors.push("Prospect name is required.");
  if (fullName.length > 120)
    errors.push("Prospect name is too long (max 120 characters).");
  if (email !== undefined && !isEmail(email))
    errors.push("Email must be a valid address.");
  if (phone !== undefined && !isPhone(phone))
    errors.push("Phone format is invalid.");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      full_name: fullName,
      email: email ?? null,
      phone: phone ?? null,
    },
  };
}

export type TransitionProspectPayload = {
  prospect_id: string;
  state: ProspectState;
  // The group to attach. Null carries the Prospect's current group forward; the
  // authoritative group-required invariant is enforced in the RPC + the pure
  // funnel core, so the validator only checks shape.
  group_id: string | null;
};

export function validateTransitionProspectPayload(
  input: unknown
): ValidationResult<TransitionProspectPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.prospect_id)) errors.push("prospect_id must be a uuid");
  if (!isProspectState(input.state)) {
    errors.push("State isn't a valid value.");
  }
  const groupRaw = readOptionalString(input.group_id);
  if (groupRaw !== undefined && !isUuid(groupRaw)) {
    errors.push("Group is invalid.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      prospect_id: normalizeUuid(input.prospect_id as string),
      state: input.state as ProspectState,
      group_id: groupRaw ? normalizeUuid(groupRaw) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Pivot slice 7 — Prospect Next Step + Additional Note payload (#379).
// ---------------------------------------------------------------------------

export type SetProspectNextStepPayload = {
  prospect_id: string;
  // The canonical next_step jsonb (snake_case keys) to store, or null to clear
  // the current step. The pure core (normalizeNextStep) owns the shape rules;
  // the RPC re-validates authoritatively.
  next_step: {
    type: string;
    due_date: string | null;
    detail: string | null;
  } | null;
  additional_note: string | null;
};

// The next-step type sentinel a form posts to mean "no step / clear it". An
// empty select value collapses to no step.
const NO_NEXT_STEP = "";

export function validateSetProspectNextStepPayload(
  input: unknown
): ValidationResult<SetProspectNextStepPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.prospect_id)) errors.push("prospect_id must be a uuid");

  // The Next Step is optional: a blank/absent type means "clear the step".
  const rawType = trimString(input.next_step_type) ?? NO_NEXT_STEP;
  let nextStep: SetProspectNextStepPayload["next_step"] = null;
  if (rawType !== NO_NEXT_STEP) {
    const normalized = normalizeNextStep({
      type: rawType,
      dueDate: input.next_step_due_date,
      detail: input.next_step_detail,
    });
    if (!normalized.ok) {
      if (normalized.error === "invalid_type")
        errors.push("Next step type isn't a valid value.");
      else if (normalized.error === "invalid_due_date")
        errors.push("Next step due date must be a valid date (YYYY-MM-DD).");
      else errors.push("Next step detail is too long (max 2000 characters).");
    } else {
      nextStep = {
        type: normalized.value.type,
        due_date: normalized.value.dueDate,
        detail: normalized.value.detail,
      };
    }
  }

  // The Additional Note is independent of the step.
  const note = normalizeAdditionalNote(input.additional_note);
  if (!note.ok)
    errors.push("Additional note is too long (max 2000 characters).");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      prospect_id: normalizeUuid(input.prospect_id as string),
      next_step: nextStep,
      additional_note: note.ok ? note.value : null,
    },
  };
}
