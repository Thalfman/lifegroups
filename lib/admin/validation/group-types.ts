import type { ValidationResult } from "./shared";
import { isRecord } from "./shared";
import {
  decodeCellOverride,
  type CellReadinessOverride,
} from "@/lib/admin/cell-readiness";

// Settings → Group types: the admin manages the canonical list of free-text type
// names in a single text box (one per line). And in Multiply, each type carries
// an optional config (a target group count + an optional readiness-rule override
// that inherits the single global rule when unset). Both validate here so the
// client and the SECURITY DEFINER RPCs (admin_set_group_types /
// admin_set_group_type_config) reject identically; the RPCs stay the gate.

const MAX_TYPE_NAME_LENGTH = 80;
const MAX_TYPE_COUNT = 100;
const MAX_TARGET_COUNT = 1000;

export type SetGroupTypesPayload = {
  // The canonical, ordered, trimmed, case-insensitively deduped list of names.
  types: string[];
};

// Accepts either a newline-separated text blob (the textarea field `types_text`)
// or an already-parsed string array (`types`, for programmatic callers/tests).
// Blank lines are dropped; names are trimmed; duplicates (case-insensitive) are
// collapsed keeping first occurrence; order is preserved.
export function validateSetGroupTypesPayload(
  input: unknown
): ValidationResult<SetGroupTypesPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  let raw: string[];
  if (Array.isArray(input.types)) {
    raw = input.types.map((v) => (typeof v === "string" ? v : String(v)));
  } else if (typeof input.types_text === "string") {
    raw = input.types_text.split(/\r?\n/);
  } else if (typeof input.types === "string") {
    raw = input.types.split(/\r?\n/);
  } else {
    raw = [];
  }

  const seen = new Set<string>();
  const types: string[] = [];
  for (const entry of raw) {
    const name = entry.trim();
    if (name.length === 0) continue;
    if (name.length > MAX_TYPE_NAME_LENGTH) {
      errors.push(
        `Each group type must be ${MAX_TYPE_NAME_LENGTH} characters or fewer.`
      );
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    types.push(name);
  }

  if (types.length > MAX_TYPE_COUNT) {
    errors.push(`Too many group types (max ${MAX_TYPE_COUNT}).`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { types } };
}

// #747: the inline "Add new type…" affordance appends a single name to the
// canonical list. Same per-name rules as the whole-list validator (trim,
// non-blank, ≤80 chars); the idempotent admin_add_group_type RPC stays the gate.
export type AddGroupTypePayload = {
  name: string;
};

export function validateAddGroupTypePayload(
  input: unknown
): ValidationResult<AddGroupTypePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const name =
    typeof input.group_type === "string" ? input.group_type.trim() : "";

  if (name.length === 0) return { ok: false, errors: ["Enter a group type."] };
  if (name.length > MAX_TYPE_NAME_LENGTH)
    return {
      ok: false,
      errors: [
        `A group type must be ${MAX_TYPE_NAME_LENGTH} characters or fewer.`,
      ],
    };

  return { ok: true, value: { name } };
}

export type SetGroupTypeConfigPayload = {
  groupType: string;
  targetCount: number;
  // null = inherit the single global readiness rule. A non-null override is a
  // partial of the global rule (present pillars override, absent inherit).
  readinessRule: CellReadinessOverride | null;
};

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseTargetCount(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? raw : Number.NaN;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return 0;
    if (!/^\d+$/.test(trimmed)) return Number.NaN;
    return Number.parseInt(trimmed, 10);
  }
  return Number.NaN;
}

export function validateSetGroupTypeConfigPayload(
  input: unknown
): ValidationResult<SetGroupTypeConfigPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  const groupType =
    typeof input.group_type === "string" ? input.group_type.trim() : "";
  if (groupType.length === 0) errors.push("A group type is required.");
  if (groupType.length > MAX_TYPE_NAME_LENGTH)
    errors.push(
      `Group type is too long (max ${MAX_TYPE_NAME_LENGTH} characters).`
    );

  const targetCount = parseTargetCount(input.target_count);
  if (targetCount === undefined || Number.isNaN(targetCount))
    errors.push("Target count must be a whole number.");
  else if (targetCount < 0) errors.push("Target count can't be negative.");
  else if (targetCount > MAX_TARGET_COUNT)
    errors.push(`Target count is unusually large (max ${MAX_TARGET_COUNT}).`);

  // The readiness override is optional. Absent / empty (or an empty object)
  // clears it back to the global rule; a present object is decoded through the
  // pure trust-boundary decoder so only validly-shaped pillars survive.
  let readinessRule: CellReadinessOverride | null = null;
  if (
    input.readiness_rule !== undefined &&
    input.readiness_rule !== null &&
    input.readiness_rule !== ""
  ) {
    const ruleRaw = parseJsonObject(input.readiness_rule);
    if (ruleRaw === undefined) {
      errors.push("readiness_rule must be a JSON object.");
    } else {
      const decoded = decodeCellOverride(ruleRaw);
      readinessRule = Object.keys(decoded).length > 0 ? decoded : null;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      groupType,
      targetCount: targetCount as number,
      readinessRule,
    },
  };
}
