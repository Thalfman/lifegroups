import type { ValidationResult } from "./shared";
import { isRecord } from "./shared";
import {
  validateRubric,
  type RubricCriterion,
} from "@/lib/admin/health-rubric";

// Health Rubric write-validation contract (#374 / ADR 0018). The Settings editor
// is a client component that manages the criteria array and posts it as a single
// `criteria` JSON string plus the rubric `kind`. This validator parses that
// payload, shapes each entry to {key,label,weight}, and runs it through the pure
// `validateRubric` weight-to-100 gate — the same gate the editor uses to disable
// Save, so the client and the server reject identically. The SECURITY DEFINER
// RPC stays the trust boundary; this just keeps malformed input off the wire and
// supplies friendlier messages.

export type HealthRubricPayload = {
  kind: "group" | "leader";
  criteria: RubricCriterion[];
};

const KINDS = new Set(["group", "leader"]);

// Parse `criteria` from either a JSON string (form submission) or an already-
// parsed array (object callers / tests). Returns undefined when unparseable.
function parseCriteria(raw: unknown): unknown[] | undefined {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function validateHealthRubricPayload(
  input: unknown
): ValidationResult<HealthRubricPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];

  const kind = typeof input.kind === "string" ? input.kind : "";
  if (!KINDS.has(kind)) {
    errors.push("kind must be 'group' or 'leader'.");
  }

  const rawCriteria = parseCriteria(input.criteria);
  if (rawCriteria === undefined) {
    return {
      ok: false,
      errors: [...errors, "criteria must be an array of {key,label,weight}."],
    };
  }

  // Coerce each entry into the criterion shape; non-numeric weights become NaN
  // so validateRubric reports them rather than silently treating them as 0.
  const criteria: RubricCriterion[] = rawCriteria.map((entry) => {
    const rec = isRecord(entry) ? entry : {};
    const weightRaw = rec.weight;
    const weight =
      typeof weightRaw === "number"
        ? weightRaw
        : typeof weightRaw === "string" && weightRaw.trim() !== ""
          ? Number(weightRaw)
          : Number.NaN;
    return {
      key: typeof rec.key === "string" ? rec.key.trim() : "",
      label: typeof rec.label === "string" ? rec.label.trim() : "",
      weight,
    };
  });

  const rubricResult = validateRubric(criteria);
  if (!rubricResult.ok) errors.push(...rubricResult.errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { kind: kind as "group" | "leader", criteria },
  };
}
