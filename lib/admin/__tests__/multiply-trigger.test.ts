import { describe, expect, it } from "vitest";

import type {
  PerTypeReadinessRule,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";
import {
  ALL_OVERRIDDEN,
  buildPartial,
  decodeLevel,
  describeHealth,
  describeInterest,
  encodeLevel,
  fieldsFromRule,
  parseMin,
  pillarInheritedText,
  resolveParent,
  ruleFromFields,
  saveTargetForLevel,
  seedFieldsForLevel,
  sourceLabel,
  togglesFromPartial,
  type PillarFields,
  type PillarToggles,
} from "@/lib/admin/multiply-trigger";

// A global rule that exercises every natural unit: a required interest count, a
// required capacity, a required Group-Health letter, and a NOT-required Leader
// Health (so the "not required" inheritance copy is covered too).
const GLOBAL: ReadinessRule = {
  interest: { required: true, min: 3 },
  capacity: { required: true },
  groupHealth: { required: true, min: "B" },
  leaderHealth: { required: false, min: "C" },
};

// A per-type tier where Men's overrides two pillars (Interest + Leader Health) and
// inherits the other two — the cascade's "set only what differs" middle tier.
const PER_TYPE: Partial<
  Record<"men" | "women" | "mixed", PerTypeReadinessRule>
> = {
  men: {
    interest: { required: true, min: 5 },
    leaderHealth: { required: true, min: "C" },
  },
};

describe("saveTargetForLevel — each level targets its own RPC tier", () => {
  it("global → the global rule RPC", () => {
    expect(saveTargetForLevel({ kind: "global" })).toBe("global");
  });
  it("type → the per-type (Audience) RPC", () => {
    expect(saveTargetForLevel({ kind: "type", audience: "men" })).toBe(
      "audience"
    );
  });
  it("cell → the per-cell overrides RPC", () => {
    expect(
      saveTargetForLevel({ kind: "cell", audience: "men", categoryId: "c1" })
    ).toBe("cell");
  });
});

describe("level encode / decode round-trips", () => {
  it("encodes each level to its select value", () => {
    expect(encodeLevel({ kind: "global" })).toBe("global");
    expect(encodeLevel({ kind: "type", audience: "women" })).toBe("type:women");
    expect(
      encodeLevel({ kind: "cell", audience: "mixed", categoryId: "abc" })
    ).toBe("cell:mixed:abc");
  });

  it("decodes valid values and rejects malformed ones", () => {
    expect(decodeLevel("global")).toEqual({ kind: "global" });
    expect(decodeLevel("type:men")).toEqual({ kind: "type", audience: "men" });
    expect(decodeLevel("cell:women:xyz")).toEqual({
      kind: "cell",
      audience: "women",
      categoryId: "xyz",
    });
    expect(decodeLevel("type:zzz")).toBeNull();
    expect(decodeLevel("cell:men")).toBeNull();
    expect(decodeLevel("bogus")).toBeNull();
  });
});

// resolveParent is a CONSUMER of the cascade home (#487) — the per-pillar
// fall-through itself (resolveReadinessRuleWithSources) is tested once in
// lib/admin/__tests__/cell-readiness.test.ts. These cover only the editor's
// mapping: which tiers feed a level's parent, and the Audience source label.
describe("resolveParent — the editor's consumer of the cascade home", () => {
  it("the global level has no parent (it is the root)", () => {
    expect(resolveParent({ kind: "global" }, GLOBAL, PER_TYPE)).toBeNull();
  });

  it("a per-type level's parent is the global-only resolution (its own tier excluded)", () => {
    const parent = resolveParent(
      { kind: "type", audience: "men" },
      GLOBAL,
      PER_TYPE
    );
    // Even pillars the Men's tier overrides inherit GLOBAL here — a level never
    // inherits from itself.
    expect(parent?.interest).toEqual({
      rule: GLOBAL.interest,
      source: "global",
    });
    expect(parent?.leaderHealth).toEqual({
      rule: GLOBAL.leaderHealth,
      source: "global",
    });
  });

  it("a per-cell level relabels the home's type tier by its Audience, else global", () => {
    const parent = resolveParent(
      { kind: "cell", audience: "men", categoryId: "c1" },
      GLOBAL,
      PER_TYPE
    );
    // A pillar the home resolved at the per-type tier is named by the Audience…
    expect(parent?.interest).toEqual({
      rule: { required: true, min: 5 },
      source: "men",
    });
    // …and a pillar that fell through to the root keeps the global source.
    expect(parent?.capacity).toEqual({
      rule: GLOBAL.capacity,
      source: "global",
    });
  });
});

describe("inheritance display copy", () => {
  it("describes each pillar in its natural unit (interest is a count, never a letter)", () => {
    expect(describeInterest({ required: true, min: 3 })).toBe("≥ 3 people");
    expect(describeInterest({ required: true, min: 1 })).toBe("≥ 1 person");
    expect(describeInterest({ required: false, min: 9 })).toBe("not required");
    expect(describeHealth({ required: true, min: "B" })).toBe("≥ B");
    expect(describeHealth({ required: false, min: "C" })).toBe("not required");
  });

  it("labels the inherited source by tier", () => {
    expect(sourceLabel("global")).toBe("Global");
    expect(sourceLabel("men")).toBe("Men's");
    expect(sourceLabel("women")).toBe("Women's");
  });

  it("a per-type pillar inherits from Global", () => {
    const parent = resolveParent(
      { kind: "type", audience: "men" },
      GLOBAL,
      PER_TYPE
    )!;
    expect(pillarInheritedText("interest", parent)).toBe(
      "Inherits ≥ 3 people (from Global)"
    );
  });

  it("a per-cell pillar names the per-type tier when that type overrides it", () => {
    const parent = resolveParent(
      { kind: "cell", audience: "men", categoryId: "c1" },
      GLOBAL,
      PER_TYPE
    )!;
    // Interest is overridden by the Men's tier → "from Men's"…
    expect(pillarInheritedText("interest", parent)).toBe(
      "Inherits ≥ 5 people (from Men's)"
    );
    // …Group Health falls through to global → "from Global".
    expect(pillarInheritedText("groupHealth", parent)).toBe(
      "Inherits ≥ B (from Global)"
    );
    expect(pillarInheritedText("leaderHealth", parent)).toBe(
      "Inherits ≥ C (from Men's)"
    );
    expect(pillarInheritedText("capacity", parent)).toBe(
      "Inherits no capacity issue (from Global)"
    );
  });
});

describe("buildPartial — each level's save payload", () => {
  const fields: PillarFields = {
    interestRequired: true,
    interestMin: "7",
    capacityRequired: false,
    groupRequired: true,
    groupMin: "A",
    leaderRequired: false,
    leaderMin: "D",
  };

  it("posts only the overridden pillars (the rest inherit)", () => {
    const toggles: PillarToggles = {
      interest: true,
      capacity: false,
      groupHealth: false,
      leaderHealth: false,
    };
    expect(buildPartial(toggles, fields)).toEqual({
      interest: { required: true, min: 7 },
    });
  });

  it("posts an empty object when nothing is overridden (clears the level)", () => {
    expect(
      buildPartial(
        {
          interest: false,
          capacity: false,
          groupHealth: false,
          leaderHealth: false,
        },
        fields
      )
    ).toEqual({});
  });

  it("the global level (all pillars overridden) posts the full rule", () => {
    // The global save reuses buildPartial with every pillar on — its payload is a
    // complete ReadinessRule, identical to ruleFromFields.
    expect(buildPartial(ALL_OVERRIDDEN, fields)).toEqual(
      ruleFromFields(fields)
    );
    expect(buildPartial(ALL_OVERRIDDEN, fields)).toEqual({
      interest: { required: true, min: 7 },
      capacity: { required: false },
      groupHealth: { required: true, min: "A" },
      leaderHealth: { required: false, min: "D" },
    });
  });
});

describe("parseMin — interest count parsing", () => {
  it("floors empty / invalid / negative entries to 0 and truncates", () => {
    expect(parseMin("5")).toBe(5);
    expect(parseMin("")).toBe(0);
    expect(parseMin("-2")).toBe(0);
    expect(parseMin("abc")).toBe(0);
    expect(parseMin("3.9")).toBe(3);
  });
});

describe("seedFieldsForLevel — what the editor shows when a level opens", () => {
  it("the global level seeds straight from the global rule with every pillar set", () => {
    const seed = seedFieldsForLevel({ kind: "global" }, GLOBAL, PER_TYPE);
    expect(seed.toggles).toEqual({
      interest: true,
      capacity: true,
      groupHealth: true,
      leaderHealth: true,
    });
    expect(seed.fields).toEqual(fieldsFromRule(GLOBAL));
  });

  it("a per-type level toggles on only the stored pillars and seeds inherited values for the rest", () => {
    const seed = seedFieldsForLevel(
      { kind: "type", audience: "men" },
      GLOBAL,
      PER_TYPE
    );
    expect(seed.toggles).toEqual({
      interest: true,
      capacity: false,
      groupHealth: false,
      leaderHealth: true,
    });
    // Overridden pillars carry the stored value…
    expect(seed.fields.interestMin).toBe("5");
    expect(seed.fields.leaderMin).toBe("C");
    expect(seed.fields.leaderRequired).toBe(true);
    // …un-overridden pillars start from the inherited (global) value.
    expect(seed.fields.capacityRequired).toBe(true);
    expect(seed.fields.groupMin).toBe("B");
  });

  it("a per-cell level seeds from its override laid over the resolved parent", () => {
    const seed = seedFieldsForLevel(
      { kind: "cell", audience: "men", categoryId: "c1" },
      GLOBAL,
      PER_TYPE,
      { capacity: { required: false } }
    );
    // Only Capacity is overridden by the cell…
    expect(seed.toggles).toEqual({
      interest: false,
      capacity: true,
      groupHealth: false,
      leaderHealth: false,
    });
    expect(seed.fields.capacityRequired).toBe(false);
    // …Interest starts from the inherited Men's per-type value (5), not global (3).
    expect(seed.fields.interestMin).toBe("5");
  });
});

describe("togglesFromPartial", () => {
  it("marks a pillar overridden iff present in the stored partial", () => {
    expect(
      togglesFromPartial({ interest: { required: true, min: 2 } })
    ).toEqual({
      interest: true,
      capacity: false,
      groupHealth: false,
      leaderHealth: false,
    });
    expect(togglesFromPartial({})).toEqual({
      interest: false,
      capacity: false,
      groupHealth: false,
      leaderHealth: false,
    });
  });
});
