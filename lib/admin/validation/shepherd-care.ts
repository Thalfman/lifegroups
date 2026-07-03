import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import type {
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { addDaysIso } from "@/lib/shared/church-time";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  normalizeUuid,
  isIsoDate,
  readBooleanFlag,
  todayIsoUtc,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker payloads.
// ---------------------------------------------------------------------------

const SHEPHERD_CARE_STATUSES: ReadonlySet<ShepherdCareStatus> = new Set([
  "doing_well",
  "needs_encouragement",
  "needs_follow_up",
  "concern",
  "inactive",
]);

const SHEPHERD_CARE_INTERACTION_TYPES: ReadonlySet<ShepherdCareInteractionType> =
  new Set(["call", "text", "in_person", "meeting", "other"]);

function isShepherdCareStatus(value: unknown): value is ShepherdCareStatus {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_STATUSES.has(value as ShepherdCareStatus)
  );
}

function isShepherdCareInteractionType(
  value: unknown
): value is ShepherdCareInteractionType {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_INTERACTION_TYPES.has(value as ShepherdCareInteractionType)
  );
}

export type UpsertShepherdCareProfilePayload = {
  shepherd_profile_id: string;
  set_current_status: boolean;
  current_status: ShepherdCareStatus;
  set_next_touchpoint_due: boolean;
  next_touchpoint_due: string | null;
  set_admin_summary: boolean;
  admin_summary: string | null;
};

export function validateUpsertShepherdCareProfilePayload(
  input: unknown
): ValidationResult<UpsertShepherdCareProfilePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const setStatus = readBooleanFlag(input.set_current_status);
  const setNext = readBooleanFlag(input.set_next_touchpoint_due);
  const setSummary = readBooleanFlag(input.set_admin_summary);

  let status: ShepherdCareStatus = "doing_well";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push(
        "Status must be doing_well, needs_encouragement, needs_follow_up, concern, or inactive."
      );
    } else {
      status = input.current_status;
    }
  }

  const nextRaw = readOptionalString(input.next_touchpoint_due);
  let next: string | null = null;
  if (setNext && nextRaw !== undefined) {
    if (!isIsoDate(nextRaw)) {
      errors.push("Next touchpoint date must be YYYY-MM-DD.");
    } else {
      next = nextRaw;
    }
  }

  const summaryRaw = readOptionalString(input.admin_summary);
  let summary: string | null = null;
  if (setSummary) {
    if (summaryRaw !== undefined) {
      if (summaryRaw.length > NOTE_MAX_CHARS) {
        errors.push(`Summary is too long (max ${NOTE_MAX_CHARS} characters).`);
      } else {
        summary = summaryRaw;
      }
    }
  }

  // At least one _set_ flag must be true; an upsert that changes
  // nothing would still write an audit row, which is wasteful.
  if (!setStatus && !setNext && !setSummary) {
    errors.push("Choose at least one field to update.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      set_current_status: setStatus,
      current_status: status,
      set_next_touchpoint_due: setNext,
      next_touchpoint_due: setNext ? next : null,
      set_admin_summary: setSummary,
      admin_summary: setSummary ? summary : null,
    },
  };
}

export type LogShepherdCareInteractionPayload = {
  shepherd_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionType;
  notes: string | null;
  set_next_touchpoint_due: boolean;
  next_touchpoint_due: string | null;
  set_current_status: boolean;
  current_status: ShepherdCareStatus;
};

export function validateLogShepherdCareInteractionPayload(
  input: unknown,
  options: { todayIso?: string } = {}
): ValidationResult<LogShepherdCareInteractionPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const interactionAt = trimString(input.interaction_at) ?? "";
  if (interactionAt.length === 0) {
    errors.push("Interaction date is required.");
  } else if (!isIsoDate(interactionAt)) {
    errors.push("Interaction date must be YYYY-MM-DD.");
  } else {
    // Allow up to UTC today + 1 day so callers in time zones ahead of
    // UTC (e.g. Sydney at 8am local is still yesterday on the UTC
    // server) can log an interaction on their local current date. The
    // SQL guard mirrors this with `current_date + 1`.
    const today = options.todayIso ?? todayIsoUtc();
    const cap = addDaysIso(today, 1);
    if (interactionAt > cap) {
      errors.push("Interaction date can't be in the future.");
    }
  }

  if (!isShepherdCareInteractionType(input.interaction_type)) {
    errors.push(
      "Interaction type must be call, text, in_person, meeting, or other."
    );
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > NOTE_MAX_CHARS) {
    errors.push(`Notes are too long (max ${NOTE_MAX_CHARS} characters).`);
  }

  const setNext = readBooleanFlag(input.set_next_touchpoint_due);
  const setStatus = readBooleanFlag(input.set_current_status);

  const nextRaw = readOptionalString(input.next_touchpoint_due);
  let next: string | null = null;
  if (setNext && nextRaw !== undefined) {
    if (!isIsoDate(nextRaw)) {
      errors.push("Next touchpoint date must be YYYY-MM-DD.");
    } else {
      next = nextRaw;
    }
  }

  let status: ShepherdCareStatus = "doing_well";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push(
        "Status must be doing_well, needs_encouragement, needs_follow_up, concern, or inactive."
      );
    } else {
      status = input.current_status;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      interaction_at: interactionAt,
      interaction_type: input.interaction_type as ShepherdCareInteractionType,
      notes: notes ?? null,
      set_next_touchpoint_due: setNext,
      next_touchpoint_due: setNext ? next : null,
      set_current_status: setStatus,
      current_status: status,
    },
  };
}
