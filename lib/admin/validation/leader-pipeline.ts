import type { LeaderReadinessStage } from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  readOptionalString,
  normalizeUuid,
  isIsoDate,
} from "./shared";

// ---------------------------------------------------------------------------
// Capacity & Multiplication #183 — Leader Pipeline (apprentice) payloads.
// ---------------------------------------------------------------------------

const LEADER_READINESS_STAGE_SET: ReadonlySet<LeaderReadinessStage> = new Set([
  "identified",
  "in_training",
  "ready_to_lead",
  "launched",
]);

function isLeaderReadinessStage(value: unknown): value is LeaderReadinessStage {
  return (
    typeof value === "string" &&
    LEADER_READINESS_STAGE_SET.has(value as LeaderReadinessStage)
  );
}

export const APPRENTICE_DISPLAY_NAME_MAX = 120;
export const APPRENTICE_NOTES_MAX = 2000;

type ApprenticeFields = {
  display_name: string;
  member_id: string | null;
  readiness_stage: LeaderReadinessStage;
  expected_ready_on: string | null;
  notes: string | null;
};

// Shared field validation for create/update. `display_name` is required (the
// apprentice's name); `member_id` is the optional members link (provisional
// person shape, PRD §6-1); stage defaults to Identified; expected-ready date is
// optional. Pushes friendly messages to `errors`.
function validateApprenticeFields(
  input: Record<string, unknown>,
  errors: string[]
): ApprenticeFields {
  const name = readOptionalString(input.display_name);
  if (name === undefined) {
    errors.push("Apprentice name is required.");
  } else if (name.length > APPRENTICE_DISPLAY_NAME_MAX) {
    errors.push(
      `Apprentice name is too long (max ${APPRENTICE_DISPLAY_NAME_MAX} characters).`
    );
  }

  let memberId: string | null = null;
  const memberRaw = readOptionalString(input.member_id);
  if (memberRaw !== undefined) {
    if (!isUuid(memberRaw)) {
      errors.push("member_id must be a uuid.");
    } else {
      memberId = normalizeUuid(memberRaw);
    }
  }

  let stage: LeaderReadinessStage = "identified";
  if (
    input.readiness_stage !== undefined &&
    input.readiness_stage !== null &&
    input.readiness_stage !== ""
  ) {
    if (!isLeaderReadinessStage(input.readiness_stage)) {
      errors.push(
        "Readiness stage must be identified, in_training, ready_to_lead, or launched."
      );
    } else {
      stage = input.readiness_stage;
    }
  }

  let expectedReadyOn: string | null = null;
  const dateRaw = readOptionalString(input.expected_ready_on);
  if (dateRaw !== undefined) {
    if (!isIsoDate(dateRaw)) {
      errors.push("Expected-ready date must be YYYY-MM-DD.");
    } else {
      expectedReadyOn = dateRaw;
    }
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > APPRENTICE_NOTES_MAX) {
    errors.push("Notes are too long (max 2000 characters).");
  }

  return {
    display_name: name ?? "",
    member_id: memberId,
    readiness_stage: stage,
    expected_ready_on: expectedReadyOn,
    notes: notes ?? null,
  };
}

export type CreateApprenticePayload = ApprenticeFields & {
  group_id: string;
};

export function validateCreateApprenticePayload(
  input: unknown
): ValidationResult<CreateApprenticePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  const fields = validateApprenticeFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { group_id: normalizeUuid(input.group_id as string), ...fields },
  };
}

export type UpdateApprenticePayload = ApprenticeFields & {
  apprentice_id: string;
};

export function validateUpdateApprenticePayload(
  input: unknown
): ValidationResult<UpdateApprenticePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.apprentice_id)) errors.push("apprentice_id must be a uuid");
  const fields = validateApprenticeFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      apprentice_id: normalizeUuid(input.apprentice_id as string),
      ...fields,
    },
  };
}

export type AdvanceApprenticeStagePayload = {
  apprentice_id: string;
  readiness_stage: LeaderReadinessStage;
};

export function validateAdvanceApprenticeStagePayload(
  input: unknown
): ValidationResult<AdvanceApprenticeStagePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.apprentice_id)) errors.push("apprentice_id must be a uuid");
  if (!isLeaderReadinessStage(input.readiness_stage))
    errors.push(
      "Readiness stage must be identified, in_training, ready_to_lead, or launched."
    );
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      apprentice_id: normalizeUuid(input.apprentice_id as string),
      readiness_stage: input.readiness_stage as LeaderReadinessStage,
    },
  };
}

export type ApprenticeIdPayload = { apprentice_id: string };

export function validateApprenticeIdPayload(
  input: unknown
): ValidationResult<ApprenticeIdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.apprentice_id))
    return { ok: false, errors: ["apprentice_id must be a uuid"] };
  return {
    ok: true,
    value: { apprentice_id: normalizeUuid(input.apprentice_id as string) },
  };
}
