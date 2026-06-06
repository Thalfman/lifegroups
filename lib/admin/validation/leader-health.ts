import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  normalizeUuid,
  readOptionalInteger,
  readOptionalString,
} from "./shared";
import type { LeaderHealthLetter } from "@/types/enums";
import type { GroupHealthOverrideScope } from "@/types/enums";

// Leader-Health Grade write-validation contract (#378 / ADR 0018, pivot slice 5).
// The Care grade-entry editor is a client component that manages the per-criterion
// 0–100 scores and posts them as a single `criterion_scores` JSON string, plus
// the profile id, the ministry year, and an optional manual override (letter +
// scope). This validator parses that payload and shapes it; the server action
// then recomputes the letter via the pure facade before the audited RPC persists
// it. The SECURITY DEFINER RPC stays the trust boundary; this keeps malformed
// input off the wire and supplies friendlier messages.

const LETTERS = new Set<LeaderHealthLetter>(["A", "B", "C", "D", "F"]);
const SCOPES = new Set<GroupHealthOverrideScope>([
  "this_month",
  "until_cleared",
]);

export type LeaderHealthGradePayload = {
  profile_id: string;
  ministry_year: number;
  // Per-criterion 0–100 scores keyed by the rubric criterion's `key`. A criterion
  // with no entry is simply absent (the engine renormalizes over what's present).
  criterion_scores: Record<string, number>;
  // Optional manual override: a forced letter + the scope it's held under, or
  // null when grading purely on the rubric. They travel together.
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
};

// Parse `criterion_scores` from either a JSON string (form submission) or an
// already-parsed object (object callers / tests). Returns undefined when
// unparseable or not an object.
function parseScores(raw: unknown): Record<string, unknown> | undefined {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function validateLeaderHealthGradePayload(
  input: unknown
): ValidationResult<LeaderHealthGradePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");

  const year = readOptionalInteger(input.ministry_year);
  if (year === "invalid" || year === undefined) {
    errors.push("ministry_year must be a whole number.");
  } else if (year < 2000 || year > 3000) {
    // A sane ministry-year window; the calendar year of the August start.
    errors.push("ministry_year is out of range.");
  }

  const rawScores = parseScores(input.criterion_scores);
  const scores: Record<string, number> = {};
  if (rawScores === undefined) {
    errors.push("criterion_scores must be an object of 0–100 numbers.");
  } else {
    for (const [key, value] of Object.entries(rawScores)) {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : Number.NaN;
      // An empty string is an unscored criterion: skip it (don't fail).
      if (typeof value === "string" && value.trim() === "") continue;
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push(`Score for "${key}" must be between 0 and 100.`);
        continue;
      }
      scores[key] = n;
    }
  }

  // The override is optional but its letter + scope travel together.
  const overrideLetterRaw = readOptionalString(input.override_letter);
  const overrideScopeRaw = readOptionalString(input.override_scope);
  let overrideLetter: LeaderHealthLetter | null = null;
  let overrideScope: GroupHealthOverrideScope | null = null;
  if (overrideLetterRaw !== undefined || overrideScopeRaw !== undefined) {
    if (overrideLetterRaw === undefined || overrideScopeRaw === undefined) {
      errors.push("An override needs both a letter and a scope.");
    } else if (!LETTERS.has(overrideLetterRaw as LeaderHealthLetter)) {
      errors.push("Override letter must be A, B, C, D, or F.");
    } else if (!SCOPES.has(overrideScopeRaw as GroupHealthOverrideScope)) {
      errors.push("Override scope must be this_month or until_cleared.");
    } else {
      overrideLetter = overrideLetterRaw as LeaderHealthLetter;
      overrideScope = overrideScopeRaw as GroupHealthOverrideScope;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      profile_id: normalizeUuid(input.profile_id as string),
      ministry_year: year as number,
      criterion_scores: scores,
      override_letter: overrideLetter,
      override_scope: overrideScope,
    },
  };
}
