import type { ValidationResult } from "./shared";
import { isNonEmptyString, isRecord, normalizeUuid } from "./shared";
import {
  decodeCellOverride,
  decodeReadinessRule,
  type CellReadinessOverride,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";

// Per-cell readiness rule write-validation contracts (#402 / PRD §2.4). The
// Settings > Groups readiness editor posts two writes:
//   1. the GLOBAL rule — { ministry_year, rule }, where rule is a JSON object
//      payload (form submission) or an already-parsed object (tests);
//   2. a cell's overrides — { category_id, audience_category, overrides }, where
//      overrides is the per-cell partial of the rule.
// Each validator parses + decodes through the pure trust-boundary decoders in
// lib/admin/cell-readiness.ts, so the client and server reject identically. The
// SECURITY DEFINER RPCs stay the authoritative gate; this keeps malformed input
// off the wire and supplies friendlier messages.

const AUDIENCE_CATEGORIES = new Set(["men", "women", "mixed"]);

// Parse a JSON payload field from either a JSON string or an already-parsed
// object. Returns undefined when unparseable / not an object.
function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseYear(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^\d{4}$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return undefined;
}

export type ReadinessRulePayload = {
  ministryYear: number;
  rule: ReadinessRule;
};

export function validateReadinessRulePayload(
  input: unknown
): ValidationResult<ReadinessRulePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  const ministryYear = parseYear(input.ministry_year);
  if (
    ministryYear === undefined ||
    ministryYear < 2000 ||
    ministryYear > 3000
  ) {
    errors.push("ministry_year must be a four-digit year.");
  }

  const ruleRaw = parseJsonObject(input.rule);
  if (ruleRaw === undefined) {
    errors.push("rule must be a JSON object.");
  }

  if (errors.length > 0) return { ok: false, errors };

  // Decode through the pure trust-boundary decoder, which normalizes every field
  // (required flags, a non-negative interest minimum, A–F-only health letters).
  return {
    ok: true,
    value: {
      ministryYear: ministryYear as number,
      rule: decodeReadinessRule(ruleRaw),
    },
  };
}

export type CellTriggerOverridePayload = {
  categoryId: string;
  audienceCategory: "men" | "women" | "mixed";
  overrides: CellReadinessOverride;
};

export function validateCellTriggerOverridePayload(
  input: unknown
): ValidationResult<CellTriggerOverridePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  const categoryId = isNonEmptyString(input.category_id)
    ? normalizeUuid(input.category_id.trim())
    : "";
  if (!isNonEmptyString(categoryId)) {
    errors.push("A category id is required.");
  }

  const audienceCategory =
    typeof input.audience_category === "string" ? input.audience_category : "";
  if (!AUDIENCE_CATEGORIES.has(audienceCategory)) {
    errors.push("The top type must be 'men', 'women', or 'mixed'.");
  }

  // The overrides payload is a JSON object (possibly empty `{}` = clear). An
  // absent / unparseable payload is rejected rather than silently treated as "no
  // override" — a save must carry an explicit (possibly empty) object.
  const overridesRaw = parseJsonObject(input.overrides);
  if (overridesRaw === undefined) {
    errors.push("overrides must be a JSON object.");
  }

  if (errors.length > 0) return { ok: false, errors };

  // Decode through the pure trust-boundary decoder: only validly-shaped pillars
  // survive as overrides; everything else is dropped so it inherits the global
  // rule.
  return {
    ok: true,
    value: {
      categoryId,
      audienceCategory: audienceCategory as "men" | "women" | "mixed",
      overrides: decodeCellOverride(overridesRaw),
    },
  };
}
