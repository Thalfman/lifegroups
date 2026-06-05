import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import { isRecord, normalizeUuid, readOptionalInteger } from "./shared";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";

// Group-Health Grade by rubric write-validation contract (#377 / ADR 0018, Pivot
// slice 4). The Care grade-entry control posts the group, the ministry year, the
// per-criterion 0–100 scores as a single `criterion_scores` JSON string, and an
// optional letter override (letter + scope). The COMPUTED letter is NOT a client
// input — the action recomputes it server-side via the pure facade before
// writing — so it is deliberately absent here. The SECURITY DEFINER RPC stays
// the trust boundary; this keeps malformed input off the wire with friendlier
// messages, mirroring the RPC's range + enum checks.

const LETTERS = new Set<GroupHealthLetter>(["A", "B", "C", "D", "F"]);
const SCOPES = new Set<GroupHealthOverrideScope>([
  "this_month",
  "until_cleared",
]);

export type GroupRubricGradePayload = {
  group_id: string;
  ministry_year: number;
  // Per-criterion 0–100 scores keyed by criterion key. An empty object is a
  // valid "no scores yet" save (e.g. setting only an override).
  criterion_scores: Record<string, number>;
  override_letter: GroupHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
};

// Parse `criterion_scores` from either a JSON string (form submission) or an
// already-parsed object (object callers / tests). Returns undefined when
// unparseable or not a plain object.
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
  if (raw === undefined || raw === null) return {};
  return undefined;
}

export function validateGroupRubricGradePayload(
  input: unknown
): ValidationResult<GroupRubricGradePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");

  const year = readOptionalInteger(input.ministry_year);
  if (year === "invalid" || year === undefined) {
    errors.push("ministry_year must be a whole number.");
  } else if (year < 2000 || year > 2100) {
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
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push(`Score for "${key}" must be between 0 and 100.`);
      } else {
        scores[key] = n;
      }
    }
  }

  // The override letter + scope travel together: a letter with no scope (or vice
  // versa) is incomplete. An absent letter means "no override".
  const letterRaw =
    typeof input.override_letter === "string"
      ? input.override_letter.trim()
      : "";
  const scopeRaw =
    typeof input.override_scope === "string" ? input.override_scope.trim() : "";

  let overrideLetter: GroupHealthLetter | null = null;
  let overrideScope: GroupHealthOverrideScope | null = null;
  if (letterRaw !== "" || scopeRaw !== "") {
    if (!LETTERS.has(letterRaw as GroupHealthLetter)) {
      errors.push("Override letter must be one of A, B, C, D, F.");
    } else {
      overrideLetter = letterRaw as GroupHealthLetter;
    }
    if (!SCOPES.has(scopeRaw as GroupHealthOverrideScope)) {
      errors.push("Override scope must be this-month or until-cleared.");
    } else {
      overrideScope = scopeRaw as GroupHealthOverrideScope;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      ministry_year: year as number,
      criterion_scores: scores,
      override_letter: overrideLetter,
      override_scope: overrideScope,
    },
  };
}
