import { describe, expect, it } from "vitest";

import {
  validateSetGroupTypesPayload,
  validateSetGroupTypeConfigPayload,
  validateAddGroupTypePayload,
  validateSetGroupTypeInPipelinePayload,
} from "@/lib/admin/validation/group-types";

// The Settings group-type list + the Multiply per-type config validators. Both
// keep malformed input off the wire; the audited RPCs stay the authoritative
// gate.

describe("validateSetGroupTypesPayload", () => {
  it("parses a newline blob: trims, drops blanks, dedupes case-insensitively", () => {
    const result = validateSetGroupTypesPayload({
      types_text: "  Men's \n\nWomen's\nmen's\n",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.types).toEqual(["Men's", "Women's"]);
  });

  it("accepts an already-parsed array", () => {
    const result = validateSetGroupTypesPayload({
      types: ["A", "B", "a"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.types).toEqual(["A", "B"]);
  });

  it("rejects an over-long type name", () => {
    const result = validateSetGroupTypesPayload({ types: ["x".repeat(81)] });
    expect(result.ok).toBe(false);
  });

  it("treats an empty/absent list as an empty array (clears the list)", () => {
    const result = validateSetGroupTypesPayload({ types_text: "\n  \n" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.types).toEqual([]);
  });
});

describe("validateSetGroupTypeConfigPayload", () => {
  it("accepts a type name + target, no override (inherits global)", () => {
    const result = validateSetGroupTypeConfigPayload({
      group_type: "  Men's ",
      target_count: "3",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.groupType).toBe("Men's");
      expect(result.value.targetCount).toBe(3);
      expect(result.value.readinessRule).toBeNull();
    }
  });

  it("requires a group type", () => {
    const result = validateSetGroupTypeConfigPayload({
      group_type: "",
      target_count: "1",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric / negative target", () => {
    expect(
      validateSetGroupTypeConfigPayload({
        group_type: "A",
        target_count: "abc",
      }).ok
    ).toBe(false);
    expect(
      validateSetGroupTypeConfigPayload({
        group_type: "A",
        target_count: "-1",
      }).ok
    ).toBe(false);
  });

  it("defaults a missing target to 0", () => {
    const result = validateSetGroupTypeConfigPayload({ group_type: "A" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.targetCount).toBe(0);
  });
});

describe("validateAddGroupTypePayload (#747)", () => {
  it("trims and accepts a single type name", () => {
    const result = validateAddGroupTypePayload({
      group_type: "  Young Families ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.groupType).toBe("Young Families");
  });

  it("rejects a blank / whitespace-only name", () => {
    expect(validateAddGroupTypePayload({ group_type: "   " }).ok).toBe(false);
    expect(validateAddGroupTypePayload({ group_type: "" }).ok).toBe(false);
    expect(validateAddGroupTypePayload({}).ok).toBe(false);
  });

  it("rejects a name longer than 80 chars", () => {
    expect(validateAddGroupTypePayload({ group_type: "x".repeat(81) }).ok).toBe(
      false
    );
  });
});

describe("validateSetGroupTypeInPipelinePayload (#755)", () => {
  it("accepts a known type with a true/false flag (string-tolerant)", () => {
    const on = validateSetGroupTypeInPipelinePayload({
      group_type: " Women ",
      in_pipeline: "true",
    });
    expect(on.ok).toBe(true);
    if (on.ok) {
      expect(on.value.groupType).toBe("Women");
      expect(on.value.inPipeline).toBe(true);
    }

    const off = validateSetGroupTypeInPipelinePayload({
      group_type: "Women",
      in_pipeline: "false",
    });
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.value.inPipeline).toBe(false);
  });

  it("defaults a missing flag to false", () => {
    const result = validateSetGroupTypeInPipelinePayload({ group_type: "Men" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.inPipeline).toBe(false);
  });

  it("rejects an empty/over-long group type", () => {
    expect(
      validateSetGroupTypeInPipelinePayload({
        group_type: "",
        in_pipeline: "true",
      }).ok
    ).toBe(false);
    expect(
      validateSetGroupTypeInPipelinePayload({
        group_type: "x".repeat(81),
        in_pipeline: "true",
      }).ok
    ).toBe(false);
  });
});
