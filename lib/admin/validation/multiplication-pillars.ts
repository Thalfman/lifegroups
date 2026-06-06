import type { ValidationResult } from "./shared";
import { isRecord } from "./shared";
import {
  decodePillarThresholds,
  decodeTriggerRubric,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";

// Multiplication Pillars config write-validation contract (#380, updated #401).
// The Settings editor posts one group type's config: the group_type, the
// ministry_year, and two JSON payloads (thresholds, trigger), each as a JSON
// string (form submission) or an object (tests). #401 retired the fed-capacity
// payload — capacity is now a derived per-cell issue, so it is no longer posted or
// validated. This validator parses + decodes through the pure trust-boundary
// decoders, so the client and server reject identically. The SECURITY DEFINER RPC
// stays the authoritative gate; this keeps malformed input off the wire and
// supplies friendlier messages.

const GROUP_TYPES = new Set(["men", "women", "mixed"]);

export type MultiplicationConfigPayload = {
  groupType: "men" | "women" | "mixed";
  ministryYear: number;
  thresholds: PillarThresholds;
  trigger: TriggerRubric;
};

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

export function validateMultiplicationConfigPayload(
  input: unknown
): ValidationResult<MultiplicationConfigPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  const groupType =
    typeof input.group_type === "string" ? input.group_type : "";
  if (!GROUP_TYPES.has(groupType)) {
    errors.push("group_type must be 'men', 'women', or 'mixed'.");
  }

  const ministryYear = parseYear(input.ministry_year);
  if (
    ministryYear === undefined ||
    ministryYear < 2000 ||
    ministryYear > 3000
  ) {
    errors.push("ministry_year must be a four-digit year.");
  }

  const thresholdsRaw = parseJsonObject(input.thresholds);
  if (thresholdsRaw === undefined) {
    errors.push("thresholds must be a JSON object.");
  }
  const triggerRaw = parseJsonObject(input.trigger);
  if (triggerRaw === undefined) {
    errors.push("trigger must be a JSON object.");
  }

  if (errors.length > 0) return { ok: false, errors };

  // Decode through the pure trust-boundary decoders, which normalize every field
  // to a sane value (default bands, A–F-only minimums).
  return {
    ok: true,
    value: {
      groupType: groupType as "men" | "women" | "mixed",
      ministryYear: ministryYear as number,
      thresholds: decodePillarThresholds(thresholdsRaw),
      trigger: decodeTriggerRubric(triggerRaw),
    },
  };
}
