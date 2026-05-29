// Validation for Over-Shepherd write payloads. Interactions-only by design:
// there is no admin_summary, current_status, or next_touchpoint_due field —
// an Over-Shepherd may never write the admin-only field, and the care-follow-up
// half (status / touchpoint) is the SC.1B-dependent slice split into a
// follow-on issue. Mirrors the leader/admin validators' shape.

import { isUuid } from "@/lib/shared/uuid";
import type { ShepherdCareInteractionType } from "@/types/enums";

// Mirrors the per-module helper in lib/admin/validation.ts + lib/leader/validation.ts.
function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type OverShepherdLogInteractionPayload = {
  shepherd_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionType;
  notes: string | null;
};

const INTERACTION_TYPES: ReadonlySet<ShepherdCareInteractionType> = new Set([
  "call",
  "text",
  "in_person",
  "meeting",
  "other",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function trimString(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

// YYYY-MM-DD with a real-calendar check (rejects 2026-02-31 etc.).
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function validateOverShepherdLogInteractionPayload(
  input: unknown,
  options: { todayIso?: string } = {},
): ValidationResult<OverShepherdLogInteractionPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const interactionAt = trimString(input.interaction_at) ?? "";
  if (interactionAt.length === 0) {
    errors.push("Interaction date is required.");
  } else if (!isIsoDate(interactionAt)) {
    errors.push("Interaction date must be YYYY-MM-DD.");
  } else {
    // Allow up to UTC today + 1 day for callers ahead of UTC; mirrors the
    // SQL guard's `current_date + 1`.
    const cap = addDaysToIsoDate(options.todayIso ?? todayIsoUtc(), 1);
    if (interactionAt > cap) {
      errors.push("Interaction date can't be in the future.");
    }
  }

  if (
    typeof input.interaction_type !== "string" ||
    !INTERACTION_TYPES.has(input.interaction_type as ShepherdCareInteractionType)
  ) {
    errors.push("Interaction type must be call, text, in_person, meeting, or other.");
  }

  let notes: string | null = null;
  const rawNotes = trimString(input.notes);
  if (rawNotes !== undefined && rawNotes.length > 0) {
    if (rawNotes.length > 2000) {
      errors.push("Notes are too long (max 2000 characters).");
    } else {
      notes = rawNotes;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      interaction_at: interactionAt,
      interaction_type: input.interaction_type as ShepherdCareInteractionType,
      notes,
    },
  };
}
