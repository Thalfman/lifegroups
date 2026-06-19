import type { ValidationResult } from "./shared";
import { isRecord } from "./shared";
import {
  decodeReadinessRule,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";

// Global readiness rule write-validation. The Settings/Multiply readiness editor
// posts the GLOBAL rule — { ministry_year, rule }, where rule is a JSON object
// payload (form submission) or an already-parsed object (tests). It parses +
// decodes through the pure trust-boundary decoder in lib/admin/cell-readiness.ts,
// so the client and server reject identically. The SECURITY DEFINER RPC stays the
// authoritative gate; this keeps malformed input off the wire with friendlier
// messages. (Per-type readiness overrides ride on the group-type config payload —
// see validation/group-types.ts.)

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
