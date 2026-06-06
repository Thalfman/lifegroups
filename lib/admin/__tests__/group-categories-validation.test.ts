import { describe, expect, it } from "vitest";
import {
  validateCreateGroupCategoryPayload,
  validateRenameGroupCategoryPayload,
  validateArchiveGroupCategoryPayload,
  validateSetCategoryTypeCellPayload,
  validateSetCategoryTypeTargetCountPayload,
} from "@/lib/admin/validation";

const UUID = "11111111-1111-1111-1111-111111111111";

// Group Category catalog + cell-matrix write-validation contracts (#396). The
// validators keep malformed input off the wire; the RPCs stay the authoritative
// gate. These cover the catalog CRUD payloads and the cell apply/unapply payload.

describe("validateCreateGroupCategoryPayload", () => {
  it("accepts a free-form label, trimming surrounding space", () => {
    const r = validateCreateGroupCategoryPayload({ label: "  20-30s  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ label: "20-30s" });
  });

  it("rejects a blank or whitespace-only label", () => {
    expect(validateCreateGroupCategoryPayload({ label: "   " }).ok).toBe(false);
    expect(validateCreateGroupCategoryPayload({ label: "" }).ok).toBe(false);
    expect(validateCreateGroupCategoryPayload({}).ok).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateCreateGroupCategoryPayload("20-30s").ok).toBe(false);
  });

  it("rejects an over-long label", () => {
    const r = validateCreateGroupCategoryPayload({ label: "x".repeat(81) });
    expect(r.ok).toBe(false);
  });
});

describe("validateRenameGroupCategoryPayload", () => {
  it("accepts an id + label, lowercasing the id and trimming the label", () => {
    const r = validateRenameGroupCategoryPayload({
      category_id: UUID.toUpperCase(),
      label: "  40-50s ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ categoryId: UUID, label: "40-50s" });
  });

  it("rejects a missing id", () => {
    expect(validateRenameGroupCategoryPayload({ label: "40-50s" }).ok).toBe(
      false
    );
  });

  it("rejects a blank label", () => {
    expect(
      validateRenameGroupCategoryPayload({ category_id: UUID, label: " " }).ok
    ).toBe(false);
  });
});

describe("validateArchiveGroupCategoryPayload", () => {
  it("accepts an id, lowercasing it", () => {
    const r = validateArchiveGroupCategoryPayload({
      category_id: UUID.toUpperCase(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ categoryId: UUID });
  });

  it("rejects a missing id", () => {
    expect(validateArchiveGroupCategoryPayload({}).ok).toBe(false);
  });
});

describe("validateSetCategoryTypeCellPayload", () => {
  it("accepts a cell apply with a boolean active flag", () => {
    const r = validateSetCategoryTypeCellPayload({
      category_id: UUID,
      audience_category: "men",
      active: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toEqual({
        categoryId: UUID,
        audienceCategory: "men",
        active: true,
      });
  });

  it("parses a string active flag from a form post", () => {
    const on = validateSetCategoryTypeCellPayload({
      category_id: UUID,
      audience_category: "women",
      active: "true",
    });
    const off = validateSetCategoryTypeCellPayload({
      category_id: UUID,
      audience_category: "women",
      active: "false",
    });
    expect(on.ok && on.value.active).toBe(true);
    expect(off.ok && off.value.active).toBe(false);
  });

  it("rejects an unknown top type", () => {
    expect(
      validateSetCategoryTypeCellPayload({
        category_id: UUID,
        audience_category: "couples",
        active: true,
      }).ok
    ).toBe(false);
  });

  it("rejects an unparseable active flag rather than defaulting to false", () => {
    expect(
      validateSetCategoryTypeCellPayload({
        category_id: UUID,
        audience_category: "mixed",
        active: "maybe",
      }).ok
    ).toBe(false);
  });

  it("rejects a missing category id", () => {
    expect(
      validateSetCategoryTypeCellPayload({
        audience_category: "men",
        active: true,
      }).ok
    ).toBe(false);
  });
});

// #400 / PRD §2.3: the per-cell target_count write validator.
describe("validateSetCategoryTypeTargetCountPayload", () => {
  it("accepts a non-negative count from a form post (string)", () => {
    const r = validateSetCategoryTypeTargetCountPayload({
      category_id: UUID.toUpperCase(),
      audience_category: "men",
      target_count: "2",
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toEqual({
        categoryId: UUID,
        audienceCategory: "men",
        count: 2,
      });
  });

  it("accepts 0 as a valid target", () => {
    const r = validateSetCategoryTypeTargetCountPayload({
      category_id: UUID,
      audience_category: "women",
      target_count: 0,
    });
    expect(r.ok && r.value.count).toBe(0);
  });

  it("rejects a negative count", () => {
    expect(
      validateSetCategoryTypeTargetCountPayload({
        category_id: UUID,
        audience_category: "men",
        target_count: "-1",
      }).ok
    ).toBe(false);
  });

  it("rejects a non-integer / unparseable count", () => {
    expect(
      validateSetCategoryTypeTargetCountPayload({
        category_id: UUID,
        audience_category: "men",
        target_count: "two",
      }).ok
    ).toBe(false);
    expect(
      validateSetCategoryTypeTargetCountPayload({
        category_id: UUID,
        audience_category: "men",
        target_count: "1.5",
      }).ok
    ).toBe(false);
  });

  it("rejects an empty target (the admin must type a number)", () => {
    expect(
      validateSetCategoryTypeTargetCountPayload({
        category_id: UUID,
        audience_category: "men",
        target_count: "",
      }).ok
    ).toBe(false);
  });

  it("rejects an unknown top type", () => {
    expect(
      validateSetCategoryTypeTargetCountPayload({
        category_id: UUID,
        audience_category: "couples",
        target_count: "2",
      }).ok
    ).toBe(false);
  });

  it("rejects a missing category id", () => {
    expect(
      validateSetCategoryTypeTargetCountPayload({
        audience_category: "men",
        target_count: "2",
      }).ok
    ).toBe(false);
  });
});
