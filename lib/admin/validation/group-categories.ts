import type { ValidationResult } from "./shared";
import { isNonEmptyString, isRecord, normalizeUuid } from "./shared";

// Group Category catalog + cell-matrix write-validation contracts (#396). The
// Settings > Groups editor posts free-form catalog CRUD (create / rename /
// archive) and the (top type × category) cell apply/unapply. These validators
// keep malformed input off the wire and supply friendlier messages; the
// SECURITY DEFINER RPCs stay the authoritative gate (duplicate-label, missing
// category, etc. are re-checked there).

// Catalog labels are free-form but bounded, so a stray paste can't store an
// unbounded blob. The column itself is unbounded text; this is a UI sanity cap.
const MAX_LABEL_LENGTH = 80;

const AUDIENCE_CATEGORIES = new Set(["men", "women", "mixed"]);

export type CreateGroupCategoryPayload = { label: string };

export function validateCreateGroupCategoryPayload(
  input: unknown
): ValidationResult<CreateGroupCategoryPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!isNonEmptyString(label)) {
    errors.push("A category needs a label.");
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.push(
      `A category label must be ${MAX_LABEL_LENGTH} characters or fewer.`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { label } };
}

export type RenameGroupCategoryPayload = {
  categoryId: string;
  label: string;
};

export function validateRenameGroupCategoryPayload(
  input: unknown
): ValidationResult<RenameGroupCategoryPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const errors: string[] = [];
  const categoryId = isNonEmptyString(input.category_id)
    ? normalizeUuid(input.category_id.trim())
    : "";
  if (!isNonEmptyString(categoryId)) {
    errors.push("A category id is required.");
  }

  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!isNonEmptyString(label)) {
    errors.push("A category needs a label.");
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.push(
      `A category label must be ${MAX_LABEL_LENGTH} characters or fewer.`
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { categoryId, label } };
}

export type ArchiveGroupCategoryPayload = { categoryId: string };

export function validateArchiveGroupCategoryPayload(
  input: unknown
): ValidationResult<ArchiveGroupCategoryPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const categoryId = isNonEmptyString(input.category_id)
    ? normalizeUuid(input.category_id.trim())
    : "";
  if (!isNonEmptyString(categoryId)) {
    return { ok: false, errors: ["A category id is required."] };
  }
  return { ok: true, value: { categoryId } };
}

export type SetCategoryTypeCellPayload = {
  categoryId: string;
  audienceCategory: "men" | "women" | "mixed";
  active: boolean;
};

export function validateSetCategoryTypeCellPayload(
  input: unknown
): ValidationResult<SetCategoryTypeCellPayload> {
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

  // The cell's active flag posts as a real boolean or the string "true"/"false".
  // Unlike a checkbox (absence = false), this is an explicit apply/unapply
  // intent, so an unparseable value is an error rather than a silent false.
  const rawActive = input.active;
  let active: boolean | null = null;
  if (typeof rawActive === "boolean") {
    active = rawActive;
  } else if (typeof rawActive === "string") {
    const t = rawActive.trim().toLowerCase();
    if (t === "true") active = true;
    else if (t === "false") active = false;
  }
  if (active === null) {
    errors.push("The active flag must be true or false.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      categoryId,
      audienceCategory: audienceCategory as "men" | "women" | "mixed",
      active: active as boolean,
    },
  };
}
