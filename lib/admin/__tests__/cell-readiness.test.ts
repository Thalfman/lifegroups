import { describe, expect, it } from "vitest";
import {
  BUILT_IN_READINESS_RULE,
  decodeCellOverride,
  decodePerTypeRule,
  decodeReadinessRule,
  decodeReadinessRuleWithReport,
  evaluateCellReadiness,
  resolveCellRule,
  resolveReadinessRule,
  resolveReadinessRuleWithSources,
  type CellReadinessInputs,
  type CellReadinessOverride,
  type PerTypeReadinessRule,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";

// Pure-resolver tests for the recast per-cell readiness trigger (#402 / PRD §2.4).
// No DB: each rule is exercised with bare objects — each pillar in its NATURAL
// unit (interest = number of people, capacity = boolean issue, health = A–F
// letters), the required/not-required logic, per-cell override precedence, and the
// trust-boundary decoders.

// A rule that requires every pillar, so a single failing pillar shows up.
const ALL_REQUIRED: ReadinessRule = {
  interest: { required: true, min: 3 },
  capacity: { required: true },
  groupHealth: { required: true, min: "C" },
  leaderHealth: { required: true, min: "C" },
};

function inputs(over: Partial<CellReadinessInputs> = {}): CellReadinessInputs {
  return {
    interestCount: 0,
    capacityIssue: false,
    groupHealth: null,
    leaderHealth: null,
    ...over,
  };
}

describe("evaluateCellReadiness — interest reads as a NUMBER", () => {
  it("clears interest when the headcount is at least the minimum", () => {
    const rule: ReadinessRule = {
      ...BUILT_IN_READINESS_RULE,
      interest: { required: true, min: 3 },
      capacity: { required: false },
    };
    // Acceptance #5: interest ≥ 3 required flips a 3-prospect cell to ready.
    const at = evaluateCellReadiness(rule, inputs({ interestCount: 3 }));
    expect(at.ready).toBe(true);
    const below = evaluateCellReadiness(rule, inputs({ interestCount: 2 }));
    expect(below.ready).toBe(false);
    expect(below.blockers).toContain("interest");
  });

  it("compares the raw count, not an A–F band (4 ≥ 3 clears; a huge count clears)", () => {
    const rule: ReadinessRule = {
      interest: { required: true, min: 3 },
      capacity: { required: false },
      groupHealth: { required: false, min: "C" },
      leaderHealth: { required: false, min: "C" },
    };
    expect(
      evaluateCellReadiness(rule, inputs({ interestCount: 4 })).ready
    ).toBe(true);
    expect(
      evaluateCellReadiness(rule, inputs({ interestCount: 999 })).ready
    ).toBe(true);
  });

  it("treats a non-finite interest count as not clearing a required minimum", () => {
    const rule: ReadinessRule = {
      ...BUILT_IN_READINESS_RULE,
      interest: { required: true, min: 1 },
      capacity: { required: false },
    };
    expect(
      evaluateCellReadiness(rule, inputs({ interestCount: Number.NaN })).ready
    ).toBe(false);
  });
});

describe("evaluateCellReadiness — capacity reads as a BOOLEAN issue", () => {
  const interestOnly: ReadinessRule = {
    interest: { required: true, min: 1 },
    capacity: { required: true },
    groupHealth: { required: false, min: "C" },
    leaderHealth: { required: false, min: "C" },
  };

  it("blocks when capacity is required and an issue is present", () => {
    const signal = evaluateCellReadiness(
      interestOnly,
      inputs({ interestCount: 5, capacityIssue: true })
    );
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("capacity");
  });

  it("clears capacity when required but there is no issue", () => {
    const signal = evaluateCellReadiness(
      interestOnly,
      inputs({ interestCount: 5, capacityIssue: false })
    );
    expect(signal.ready).toBe(true);
    expect(signal.blockers).not.toContain("capacity");
  });

  it("ignores a capacity issue when capacity is not required", () => {
    const rule: ReadinessRule = {
      ...interestOnly,
      capacity: { required: false },
    };
    const signal = evaluateCellReadiness(
      rule,
      inputs({ interestCount: 5, capacityIssue: true })
    );
    expect(signal.ready).toBe(true);
    const cap = signal.outcomes.find((o) => o.pillar === "capacity");
    expect(cap?.status).toBe("ignored");
  });
});

describe("evaluateCellReadiness — health reads as A–F LETTERS", () => {
  const groupOnly: ReadinessRule = {
    interest: { required: false, min: 0 },
    capacity: { required: false },
    groupHealth: { required: true, min: "B" },
    leaderHealth: { required: false, min: "C" },
  };

  it("clears when the letter is at least the minimum (B ≥ B, A ≥ B)", () => {
    expect(
      evaluateCellReadiness(groupOnly, inputs({ groupHealth: "B" })).ready
    ).toBe(true);
    expect(
      evaluateCellReadiness(groupOnly, inputs({ groupHealth: "A" })).ready
    ).toBe(true);
  });

  it("blocks when the letter is below the minimum (C < B)", () => {
    const signal = evaluateCellReadiness(
      groupOnly,
      inputs({ groupHealth: "C" })
    );
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("groupHealth");
  });

  it("blocks a REQUIRED but ungraded (null) health pillar", () => {
    const signal = evaluateCellReadiness(
      groupOnly,
      inputs({ groupHealth: null })
    );
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("groupHealth");
  });

  it("ignores an ungraded health pillar that is NOT required", () => {
    const rule: ReadinessRule = {
      ...groupOnly,
      groupHealth: { required: false, min: "B" },
    };
    const signal = evaluateCellReadiness(rule, inputs({ groupHealth: null }));
    expect(signal.ready).toBe(true);
    const gh = signal.outcomes.find((o) => o.pillar === "groupHealth");
    expect(gh?.status).toBe("ignored");
  });
});

describe("evaluateCellReadiness — required/not-required roll-up", () => {
  it("is ready iff every required pillar clears", () => {
    const signal = evaluateCellReadiness(
      ALL_REQUIRED,
      inputs({
        interestCount: 3,
        capacityIssue: false,
        groupHealth: "B",
        leaderHealth: "A",
      })
    );
    expect(signal.ready).toBe(true);
    expect(signal.blockers).toEqual([]);
  });

  it("names every required pillar that fell short", () => {
    const signal = evaluateCellReadiness(
      ALL_REQUIRED,
      inputs({
        interestCount: 1, // below 3
        capacityIssue: true, // issue
        groupHealth: "F", // below C
        leaderHealth: "A", // clears
      })
    );
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toEqual(["interest", "capacity", "groupHealth"]);
  });

  it("ignores not-required pillars entirely (a failing not-required pillar does not block)", () => {
    const rule: ReadinessRule = {
      interest: { required: true, min: 2 },
      capacity: { required: false },
      groupHealth: { required: false, min: "A" },
      leaderHealth: { required: false, min: "A" },
    };
    // Capacity issue + failing health are all not-required, so only interest gates.
    const signal = evaluateCellReadiness(
      rule,
      inputs({
        interestCount: 2,
        capacityIssue: true,
        groupHealth: "F",
        leaderHealth: "F",
      })
    );
    expect(signal.ready).toBe(true);
    expect(signal.blockers).toEqual([]);
    expect(signal.outcomes.filter((o) => o.status === "ignored")).toHaveLength(
      3
    );
  });

  it("produces no blended grade — only ready + per-pillar outcomes + blockers", () => {
    const signal = evaluateCellReadiness(ALL_REQUIRED, inputs());
    expect(signal).not.toHaveProperty("letter");
    expect(signal).not.toHaveProperty("grade");
    expect(signal.outcomes.map((o) => o.pillar)).toEqual([
      "interest",
      "capacity",
      "groupHealth",
      "leaderHealth",
    ]);
  });
});

describe("resolveCellRule — per-cell override precedence", () => {
  const global: ReadinessRule = {
    interest: { required: true, min: 3 },
    capacity: { required: true },
    groupHealth: { required: false, min: "C" },
    leaderHealth: { required: false, min: "C" },
  };

  it("inherits every pillar from the global rule for an empty override", () => {
    expect(resolveCellRule(global, {})).toEqual(global);
  });

  it("replaces only the overridden pillar, inheriting the rest", () => {
    const override: CellReadinessOverride = {
      interest: { required: true, min: 5 },
    };
    const resolved = resolveCellRule(global, override);
    expect(resolved.interest).toEqual({ required: true, min: 5 });
    // Untouched pillars are inherited verbatim.
    expect(resolved.capacity).toEqual(global.capacity);
    expect(resolved.groupHealth).toEqual(global.groupHealth);
    expect(resolved.leaderHealth).toEqual(global.leaderHealth);
  });

  it("an override flips a cell's verdict relative to the global rule", () => {
    const cellInputs = inputs({ interestCount: 3, capacityIssue: false });
    // Global: interest ≥ 3 → ready.
    expect(
      evaluateCellReadiness(resolveCellRule(global, {}), cellInputs).ready
    ).toBe(true);
    // Cell override: interest ≥ 5 → the same 3-prospect cell is now NOT ready.
    const stricter = resolveCellRule(global, {
      interest: { required: true, min: 5 },
    });
    expect(evaluateCellReadiness(stricter, cellInputs).ready).toBe(false);
  });

  it("an override can make a pillar NOT required for one cell only", () => {
    const strictGlobal: ReadinessRule = {
      ...global,
      capacity: { required: true },
    };
    const cellInputs = inputs({ interestCount: 3, capacityIssue: true });
    // Global requires capacity → the issue blocks.
    expect(
      evaluateCellReadiness(resolveCellRule(strictGlobal, {}), cellInputs).ready
    ).toBe(false);
    // This cell overrides capacity to not-required → the issue is ignored here.
    const lenient = resolveCellRule(strictGlobal, {
      capacity: { required: false },
    });
    expect(evaluateCellReadiness(lenient, cellInputs).ready).toBe(true);
  });
});

describe("resolveReadinessRule — three-tier cascade (#410 / ADR 0021)", () => {
  // A global rule with a distinct value in every pillar, so a pillar that falls
  // through to global is recognisable from one set at a higher tier.
  const global: ReadinessRule = {
    interest: { required: true, min: 3 },
    capacity: { required: true },
    groupHealth: { required: false, min: "C" },
    leaderHealth: { required: false, min: "C" },
  };

  it("ALL INHERIT: empty per-type + empty cell ⇒ the global rule verbatim", () => {
    expect(resolveReadinessRule(global, {}, {})).toEqual(global);
  });

  it("TYPE ONLY: a per-type pillar overrides global; the rest inherit global", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
    };
    const resolved = resolveReadinessRule(global, perType, {});
    // The per-type interest wins…
    expect(resolved.interest).toEqual({ required: true, min: 5 });
    // …and every other pillar falls through to the global rule.
    expect(resolved.capacity).toEqual(global.capacity);
    expect(resolved.groupHealth).toEqual(global.groupHealth);
    expect(resolved.leaderHealth).toEqual(global.leaderHealth);
  });

  it("CELL OVERRIDES TYPE: a cell pillar beats the per-type pillar for that pillar", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
    };
    const cell: CellReadinessOverride = {
      interest: { required: true, min: 8 },
    };
    const resolved = resolveReadinessRule(global, perType, cell);
    // Cell (8) wins over per-type (5) wins over global (3).
    expect(resolved.interest).toEqual({ required: true, min: 8 });
  });

  it("MIXED PILLARS: each pillar resolves at its own tier independently", () => {
    const perType: PerTypeReadinessRule = {
      // per-type raises interest and demands capacity stays required…
      interest: { required: true, min: 5 },
      groupHealth: { required: true, min: "B" },
    };
    const cell: CellReadinessOverride = {
      // …the cell overrides only interest and leaderHealth.
      interest: { required: true, min: 8 },
      leaderHealth: { required: true, min: "A" },
    };
    const resolved = resolveReadinessRule(global, perType, cell);
    expect(resolved).toEqual({
      interest: { required: true, min: 8 }, // cell
      capacity: { required: true }, // global (untouched at every tier)
      groupHealth: { required: true, min: "B" }, // per-type
      leaderHealth: { required: true, min: "A" }, // cell
    });
  });

  it("a per-type threshold flips a cell's verdict that has no override", () => {
    const cellInputs = inputs({ interestCount: 3, capacityIssue: false });
    // Global interest ≥ 3 → ready when there is no per-type rule.
    expect(
      evaluateCellReadiness(resolveReadinessRule(global, {}, {}), cellInputs)
        .ready
    ).toBe(true);
    // A per-type interest ≥ 5 makes the same 3-prospect cell NOT ready…
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
    };
    expect(
      evaluateCellReadiness(
        resolveReadinessRule(global, perType, {}),
        cellInputs
      ).ready
    ).toBe(false);
    // …unless the cell overrides interest back down to ≥ 3.
    expect(
      evaluateCellReadiness(
        resolveReadinessRule(global, perType, {
          interest: { required: true, min: 3 },
        }),
        cellInputs
      ).ready
    ).toBe(true);
  });

  it("resolveCellRule is the two-tier shorthand (no per-type rule)", () => {
    const override: CellReadinessOverride = {
      interest: { required: true, min: 9 },
    };
    expect(resolveCellRule(global, override)).toEqual(
      resolveReadinessRule(global, {}, override)
    );
  });
});

// The ONE home of cascade resolution WITH source attribution (#487): every
// surface — the Multiply grid evaluator (which drops the sources) and the
// Settings trigger editor's inheritance display (which reads them) — consumes
// this resolution, so the cascade is tested HERE, once, not per surface.
describe("resolveReadinessRuleWithSources — source attribution (#487)", () => {
  const global: ReadinessRule = {
    interest: { required: true, min: 3 },
    capacity: { required: true },
    groupHealth: { required: false, min: "C" },
    leaderHealth: { required: false, min: "C" },
  };

  it("ALL INHERIT: every pillar resolves to the global rule, source global", () => {
    expect(resolveReadinessRuleWithSources(global, {}, {})).toEqual({
      interest: { rule: global.interest, source: "global" },
      capacity: { rule: global.capacity, source: "global" },
      groupHealth: { rule: global.groupHealth, source: "global" },
      leaderHealth: { rule: global.leaderHealth, source: "global" },
    });
  });

  it("TYPE: a per-type pillar is attributed to the type tier; the rest stay global", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
    };
    const resolved = resolveReadinessRuleWithSources(global, perType, {});
    expect(resolved.interest).toEqual({
      rule: { required: true, min: 5 },
      source: "type",
    });
    expect(resolved.capacity).toEqual({
      rule: global.capacity,
      source: "global",
    });
    expect(resolved.groupHealth).toEqual({
      rule: global.groupHealth,
      source: "global",
    });
    expect(resolved.leaderHealth).toEqual({
      rule: global.leaderHealth,
      source: "global",
    });
  });

  it("CELL BEATS TYPE: a cell pillar is attributed to the cell even when the type also overrides it", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
    };
    const cell: CellReadinessOverride = {
      interest: { required: true, min: 8 },
    };
    expect(
      resolveReadinessRuleWithSources(global, perType, cell).interest
    ).toEqual({ rule: { required: true, min: 8 }, source: "cell" });
  });

  it("MIXED PILLARS: each pillar carries its own tier's source independently", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
      groupHealth: { required: true, min: "B" },
    };
    const cell: CellReadinessOverride = {
      interest: { required: true, min: 8 },
      leaderHealth: { required: true, min: "A" },
    };
    expect(resolveReadinessRuleWithSources(global, perType, cell)).toEqual({
      interest: { rule: { required: true, min: 8 }, source: "cell" },
      capacity: { rule: { required: true }, source: "global" },
      groupHealth: { rule: { required: true, min: "B" }, source: "type" },
      leaderHealth: { rule: { required: true, min: "A" }, source: "cell" },
    });
  });

  it("resolveReadinessRule is the source-ignoring projection the evaluator runs", () => {
    const perType: PerTypeReadinessRule = {
      interest: { required: true, min: 5 },
      groupHealth: { required: true, min: "B" },
    };
    const cell: CellReadinessOverride = {
      leaderHealth: { required: true, min: "A" },
    };
    const withSources = resolveReadinessRuleWithSources(global, perType, cell);
    expect(resolveReadinessRule(global, perType, cell)).toEqual({
      interest: withSources.interest.rule,
      capacity: withSources.capacity.rule,
      groupHealth: withSources.groupHealth.rule,
      leaderHealth: withSources.leaderHealth.rule,
    });
  });
});

describe("decodePerTypeRule — trust boundary (per-type partial)", () => {
  it("returns an empty rule for a non-object / empty payload (inherit all)", () => {
    expect(decodePerTypeRule(null)).toEqual({});
    expect(decodePerTypeRule({})).toEqual({});
  });

  it("includes ONLY the pillars present in the payload (absent = inherit global)", () => {
    const rule = decodePerTypeRule({
      interest: { required: true, min: 5 },
    });
    expect(rule).toEqual({ interest: { required: true, min: 5 } });
    expect(rule).not.toHaveProperty("capacity");
    expect(rule).not.toHaveProperty("groupHealth");
    expect(rule).not.toHaveProperty("leaderHealth");
  });

  it("decodes a present-but-malformed fragment defensively while keeping it overridden", () => {
    const rule = decodePerTypeRule({ groupHealth: { min: "Z" } });
    expect(rule.groupHealth).toEqual({ required: false, min: "C" });
  });
});

describe("decodeReadinessRule — trust boundary", () => {
  it("falls back to the built-in rule for a non-object payload", () => {
    expect(decodeReadinessRule(null)).toEqual(BUILT_IN_READINESS_RULE);
    expect(decodeReadinessRule("nope")).toEqual(BUILT_IN_READINESS_RULE);
  });

  it("decodes a full rule across all pillars", () => {
    const rule = decodeReadinessRule({
      interest: { required: true, min: 5 },
      capacity: { required: false },
      groupHealth: { required: true, min: "B" },
      leaderHealth: { required: false, min: "D" },
    });
    expect(rule).toEqual({
      interest: { required: true, min: 5 },
      capacity: { required: false },
      groupHealth: { required: true, min: "B" },
      leaderHealth: { required: false, min: "D" },
    });
  });

  it("defaults a malformed pillar fragment to the built-in (floors interest min, drops a bad letter)", () => {
    const rule = decodeReadinessRule({
      interest: { required: "yes", min: -4 },
      groupHealth: { required: true, min: "Z" },
    });
    // required falls back to built-in (true); min floors to the built-in default.
    expect(rule.interest).toEqual(BUILT_IN_READINESS_RULE.interest);
    // bad letter falls back to the built-in min, but required is honoured.
    expect(rule.groupHealth).toEqual({ required: true, min: "C" });
    // absent pillars take the built-in fragment wholesale.
    expect(rule.capacity).toEqual(BUILT_IN_READINESS_RULE.capacity);
    expect(rule.leaderHealth).toEqual(BUILT_IN_READINESS_RULE.leaderHealth);
  });

  it("truncates a fractional interest minimum to a whole headcount", () => {
    expect(
      decodeReadinessRule({ interest: { required: true, min: 3.9 } }).interest
        .min
    ).toBe(3);
  });
});

// #473: the decode-with-report path. The RULE VALUE must stay identical to
// decodeReadinessRule's — only the fellBack report is added, so the Settings
// Multiply tab and the Multiply readiness surface can warn when a stored
// trigger couldn't be read (and would be overwritten by the next save).
describe("decodeReadinessRuleWithReport — corrupt vs missing vs healthy (#473)", () => {
  it("reports NO fallback for a MISSING stored rule (null / undefined = legit default)", () => {
    expect(decodeReadinessRuleWithReport(null)).toEqual({
      rule: BUILT_IN_READINESS_RULE,
      fellBack: false,
    });
    expect(decodeReadinessRuleWithReport(undefined)).toEqual({
      rule: BUILT_IN_READINESS_RULE,
      fellBack: false,
    });
  });

  it("reports NO fallback for a healthy stored rule", () => {
    const stored = {
      interest: { required: true, min: 5 },
      capacity: { required: false },
      groupHealth: { required: true, min: "B" },
      leaderHealth: { required: false, min: "D" },
    };
    const decoded = decodeReadinessRuleWithReport(stored);
    expect(decoded.fellBack).toBe(false);
    expect(decoded.rule).toEqual(stored);
  });

  it("reports NO fallback for a healthy rule that happens to equal the built-in", () => {
    // Equality with the built-in default must not read as a fallback — the
    // report comes from the decode itself, not from comparing values.
    const decoded = decodeReadinessRuleWithReport({
      interest: { required: true, min: 3 },
      capacity: { required: true },
      groupHealth: { required: false, min: "C" },
      leaderHealth: { required: false, min: "C" },
    });
    expect(decoded.fellBack).toBe(false);
    expect(decoded.rule).toEqual(BUILT_IN_READINESS_RULE);
  });

  it("reports a fallback for a corrupt non-object payload", () => {
    expect(decodeReadinessRuleWithReport("nope")).toEqual({
      rule: BUILT_IN_READINESS_RULE,
      fellBack: true,
    });
    expect(decodeReadinessRuleWithReport(7).fellBack).toBe(true);
    expect(decodeReadinessRuleWithReport([]).fellBack).toBe(true);
  });

  it("reports a fallback when a pillar fragment is malformed or missing", () => {
    const malformed = decodeReadinessRuleWithReport({
      interest: { required: "yes", min: -4 },
      capacity: { required: true },
      groupHealth: { required: true, min: "Z" },
      leaderHealth: { required: false, min: "C" },
    });
    expect(malformed.fellBack).toBe(true);

    // Saves always store the full four-pillar rule, so a record missing a
    // pillar is also "couldn't be read as stored" — it reports too.
    const missingPillar = decodeReadinessRuleWithReport({
      interest: { required: true, min: 3 },
    });
    expect(missingPillar.fellBack).toBe(true);
  });

  it("keeps the fallback rule VALUE identical to decodeReadinessRule (reporting only)", () => {
    const corrupt = {
      interest: { required: "yes", min: -4 },
      groupHealth: { required: true, min: "Z" },
    };
    expect(decodeReadinessRuleWithReport(corrupt).rule).toEqual(
      decodeReadinessRule(corrupt)
    );
    expect(decodeReadinessRuleWithReport(null).rule).toEqual(
      decodeReadinessRule(null)
    );
    expect(decodeReadinessRuleWithReport("nope").rule).toEqual(
      decodeReadinessRule("nope")
    );
  });

  it("does NOT report benign normalization (a fractional interest minimum truncates)", () => {
    const decoded = decodeReadinessRuleWithReport({
      interest: { required: true, min: 3.9 },
      capacity: { required: true },
      groupHealth: { required: false, min: "C" },
      leaderHealth: { required: false, min: "C" },
    });
    expect(decoded.rule.interest.min).toBe(3);
    expect(decoded.fellBack).toBe(false);
  });
});

describe("decodeCellOverride — only present pillars override", () => {
  it("returns an empty override for a non-object / empty payload", () => {
    expect(decodeCellOverride(null)).toEqual({});
    expect(decodeCellOverride({})).toEqual({});
  });

  it("includes ONLY the pillars present in the payload (absent = inherit)", () => {
    const override = decodeCellOverride({
      interest: { required: true, min: 4 },
      capacity: { required: false },
    });
    expect(override).toEqual({
      interest: { required: true, min: 4 },
      capacity: { required: false },
    });
    // groupHealth / leaderHealth absent ⇒ omitted ⇒ inherit the global rule.
    expect(override).not.toHaveProperty("groupHealth");
    expect(override).not.toHaveProperty("leaderHealth");
  });

  it("decodes a present-but-malformed fragment defensively while keeping it overridden", () => {
    const override = decodeCellOverride({ groupHealth: { min: "Z" } });
    expect(override.groupHealth).toEqual({ required: false, min: "C" });
  });
});
