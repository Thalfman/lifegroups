import { describe, expect, it } from "vitest";

import {
  validateCreateGroupPayload,
  validateUpdateGroupPayload,
  validateSetGroupCategoryPayload,
} from "@/lib/admin/validation";

// #398: a group carries a free-form category_id (its cell under the top type)
// instead of the retired life_stage enum. These tests pin the validator's
// contract for category_id and assert the life_stage axis is gone from the
// write path — no payload key sets it, and the old enum values no longer
// validate as anything meaningful.

const VALID_CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";

describe("validateCreateGroupPayload — category_id (#398)", () => {
  it("accepts a uuid category_id and threads it through", () => {
    const result = validateCreateGroupPayload({
      name: "Wednesday Westside",
      audience_category: "men",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category_id).toBe(VALID_CATEGORY_ID);
    }
  });

  it("treats an empty category_id as Uncategorized (unset, not an error)", () => {
    const result = validateCreateGroupPayload({
      name: "Untagged group",
      category_id: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // An empty select collapses to undefined → the key is simply absent, which
      // the action layer maps to p_category_id = null = Uncategorized.
      expect(result.value.category_id).toBeUndefined();
    }
  });

  it("rejects a non-uuid category_id", () => {
    const result = validateCreateGroupPayload({
      name: "Bad",
      category_id: "young_professionals",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/category/i);
    }
  });
});

describe("validateUpdateGroupPayload — category_id (#398)", () => {
  it("carries category_id alongside the group id", () => {
    const result = validateUpdateGroupPayload({
      group_id: GROUP_ID,
      name: "Edited",
      audience_category: "women",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.group_id).toBe(GROUP_ID);
      expect(result.value.category_id).toBe(VALID_CATEGORY_ID);
    }
  });
});

describe("validateSetGroupCategoryPayload — Settings '+ Add existing group'", () => {
  it("accepts a group id, audience, and concrete category id", () => {
    const result = validateSetGroupCategoryPayload({
      group_id: GROUP_ID,
      audience_category: "men",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.group_id).toBe(GROUP_ID);
      expect(result.value.audience_category).toBe("men");
      expect(result.value.category_id).toBe(VALID_CATEGORY_ID);
    }
  });

  it("requires a concrete category — Uncategorized is not a tag target", () => {
    const result = validateSetGroupCategoryPayload({
      group_id: GROUP_ID,
      audience_category: "men",
      category_id: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/category/i);
    }
  });

  it("rejects a bad audience", () => {
    const result = validateSetGroupCategoryPayload({
      group_id: GROUP_ID,
      audience_category: "everyone",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/audience/i);
    }
  });

  it("rejects a missing/invalid group id", () => {
    const result = validateSetGroupCategoryPayload({
      group_id: "not-a-uuid",
      audience_category: "women",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/group_id/i);
    }
  });
});

describe("life_stage is removed from the group write path (#398)", () => {
  it("never produces a life_stage field on the validated payload", () => {
    const result = validateCreateGroupPayload({
      name: "Group",
      // A stale form value under the OLD key must be ignored, not threaded.
      life_stage: "young_professionals",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        (result.value as Record<string, unknown>).life_stage
      ).toBeUndefined();
    }
  });

  it("ignores an old life_stage key entirely (no validation error, no value)", () => {
    // The validator simply doesn't read life_stage, so submitting it neither
    // errors nor leaks — the single source of truth is category_id.
    const result = validateUpdateGroupPayload({
      group_id: GROUP_ID,
      name: "Group",
      life_stage: "retirement",
      category_id: VALID_CATEGORY_ID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        (result.value as Record<string, unknown>).life_stage
      ).toBeUndefined();
      expect(result.value.category_id).toBe(VALID_CATEGORY_ID);
    }
  });
});
