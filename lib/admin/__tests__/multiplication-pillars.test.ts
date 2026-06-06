import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PILLAR_THRESHOLDS,
  computePillars,
  decodeFedCapacity,
  decodeTriggerRubric,
  evaluateTrigger,
  flagIndividualGroupMultiply,
  gradeNumericPillar,
  rollUpGrades,
  type FedCapacity,
  type HealthLetter,
  type PillarBands,
  type PillarInputs,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";

// Pure-resolver tests for the Multiply pillars + trigger (#380). No DB: each rule
// is exercised with bare objects — per-pillar A–F grading from inputs +
// thresholds, the Ministry-Year health roll-ups, capacity-from-feed (not
// counts), trigger evaluation, the individual-group flag, and the empty-grades
// "—" (null) path.

const BANDS: PillarBands = { a: 4, b: 3, c: 2, d: 1 };

function fed(over: Partial<FedCapacity> = {}): FedCapacity {
  return { headroom: 0, fullGroupCount: 0, options: [], ...over };
}

function inputs(over: Partial<PillarInputs> = {}): PillarInputs {
  return {
    funnelVolume: 0,
    groupGrades: [],
    leaderGrades: [],
    fedCapacity: fed(),
    ...over,
  };
}

describe("gradeNumericPillar — A–F from value + bands", () => {
  it("bands at the inclusive floors", () => {
    expect(gradeNumericPillar(4, BANDS)).toBe("A");
    expect(gradeNumericPillar(3, BANDS)).toBe("B");
    expect(gradeNumericPillar(2, BANDS)).toBe("C");
    expect(gradeNumericPillar(1, BANDS)).toBe("D");
    expect(gradeNumericPillar(0, BANDS)).toBe("F");
  });

  it("grades above the A floor as A and just-below a floor as the next letter", () => {
    expect(gradeNumericPillar(99, BANDS)).toBe("A");
    expect(gradeNumericPillar(3.9, BANDS)).toBe("B");
  });

  it("grades a null / non-finite value to F (worst signal, never a free pass)", () => {
    expect(gradeNumericPillar(null, BANDS)).toBe("F");
    expect(gradeNumericPillar(Number.NaN, BANDS)).toBe("F");
    // Infinity is non-finite, so it is treated as no usable signal ⇒ F.
    expect(gradeNumericPillar(Number.POSITIVE_INFINITY, BANDS)).toBe("F");
  });

  it("honours custom (non-default) thresholds", () => {
    const tuned: PillarBands = { a: 10, b: 7, c: 4, d: 1 };
    expect(gradeNumericPillar(8, tuned)).toBe("B");
    expect(gradeNumericPillar(10, tuned)).toBe("A");
  });
});

describe("rollUpGrades — Ministry-Year health roll-up", () => {
  it("returns null for an empty array (renders as '—')", () => {
    expect(rollUpGrades([])).toBeNull();
  });

  it("returns the single grade when only one exists", () => {
    expect(rollUpGrades(["B"])).toBe("B");
  });

  it("averages GPA-style points and bands to the nearest letter", () => {
    // A(4) + C(2) = 6 / 2 = 3.0 ⇒ B.
    expect(rollUpGrades(["A", "C"])).toBe("B");
    // A(4) + A(4) + B(3) = 11 / 3 ≈ 3.67 ⇒ A.
    expect(rollUpGrades(["A", "A", "B"])).toBe("A");
    // F(0) + D(1) = 0.5 ⇒ D (half-up boundary).
    expect(rollUpGrades(["F", "D"])).toBe("D");
    // F(0) + F(0) + D(1) = 1/3 ≈ 0.33 ⇒ F.
    expect(rollUpGrades(["F", "F", "D"])).toBe("F");
  });

  it("ignores non-letter entries and treats an all-invalid array as empty", () => {
    expect(rollUpGrades(["A", "Z" as HealthLetter])).toBe("A");
    expect(rollUpGrades(["Z" as HealthLetter])).toBeNull();
  });
});

describe("computePillars — four pillars per type", () => {
  it("grades capacity from the FED headroom (not in-app counts) + thresholds", () => {
    const grades = computePillars(
      inputs({ fedCapacity: fed({ headroom: 4 }) }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    expect(grades.capacity).toBe("A");
  });

  it("grades capacity F when the admin has fed nothing (headroom null)", () => {
    const grades = computePillars(
      inputs({ fedCapacity: fed({ headroom: null }) }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    expect(grades.capacity).toBe("F");
  });

  it("derives Interest from the funnel volume + thresholds", () => {
    expect(
      computePillars(inputs({ funnelVolume: 5 }), BUILT_IN_PILLAR_THRESHOLDS)
        .interest
    ).toBe("A");
    expect(
      computePillars(inputs({ funnelVolume: 2 }), BUILT_IN_PILLAR_THRESHOLDS)
        .interest
    ).toBe("C");
    expect(
      computePillars(inputs({ funnelVolume: 0 }), BUILT_IN_PILLAR_THRESHOLDS)
        .interest
    ).toBe("F");
  });

  it("shows '—' (null) for both health pillars until grades exist", () => {
    const grades = computePillars(inputs(), BUILT_IN_PILLAR_THRESHOLDS);
    expect(grades.groupHealth).toBeNull();
    expect(grades.leaderHealth).toBeNull();
  });

  it("rolls up supplied group + leader grades over the Ministry Year", () => {
    const grades = computePillars(
      inputs({ groupGrades: ["A", "B"], leaderGrades: ["C", "C"] }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    // A+B = 3.5 ⇒ A; C+C = 2.0 ⇒ C.
    expect(grades.groupHealth).toBe("A");
    expect(grades.leaderHealth).toBe("C");
  });

  it("accepts a ministryYear arg without changing the supplied-grade roll-up", () => {
    const withYear = computePillars(
      inputs({ groupGrades: ["B"] }),
      BUILT_IN_PILLAR_THRESHOLDS,
      2025
    );
    const noYear = computePillars(
      inputs({ groupGrades: ["B"] }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    expect(withYear).toEqual(noYear);
  });

  it("uses the default thresholds when none are supplied", () => {
    const grades = computePillars(
      inputs({ funnelVolume: 3, fedCapacity: fed({ headroom: 2 }) })
    );
    expect(grades.interest).toBe("B");
    expect(grades.capacity).toBe("C");
  });
});

describe("evaluateTrigger — configurable multiply signal (no blended letter)", () => {
  const tuned: PillarThresholds = {
    capacity: BANDS,
    overflow: BANDS,
    interest: BANDS,
  };

  it("is ready when every required pillar clears its minimum", () => {
    const pillars = computePillars(
      inputs({
        funnelVolume: 4,
        fedCapacity: fed({ headroom: 4 }),
        groupGrades: ["A"],
        leaderGrades: ["A"],
      }),
      tuned
    );
    const trigger: TriggerRubric = {
      conditions: {
        capacity: { op: "atLeast", letter: "B" },
        interest: { op: "atLeast", letter: "B" },
        groupHealth: { op: "atLeast", letter: "C" },
        leaderHealth: { op: "atLeast", letter: "C" },
      },
      requireHealthGrades: true,
    };
    const signal = evaluateTrigger(trigger, pillars);
    expect(signal.ready).toBe(true);
    expect(signal.blockers).toEqual([]);
  });

  it("is not ready and names the blocker when a pillar falls short", () => {
    const pillars = computePillars(
      inputs({ funnelVolume: 1, fedCapacity: fed({ headroom: 4 }) }),
      tuned
    );
    const trigger: TriggerRubric = {
      conditions: {
        capacity: { op: "atLeast", letter: "B" },
        interest: { op: "atLeast", letter: "B" },
      },
    };
    const signal = evaluateTrigger(trigger, pillars);
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("interest");
    expect(signal.blockers).not.toContain("capacity");
  });

  it("ignores pillars not named in the trigger", () => {
    const pillars = computePillars(
      inputs({ funnelVolume: 0, fedCapacity: fed({ headroom: 4 }) }),
      tuned
    );
    // Only capacity is in the trigger; the F interest pillar is irrelevant.
    const signal = evaluateTrigger(
      { conditions: { capacity: { op: "atLeast", letter: "B" } } },
      pillars
    );
    expect(signal.ready).toBe(true);
    expect(signal.outcomes.map((o) => o.pillar)).toEqual(["capacity"]);
  });

  it("skips an ungraded health pillar when requireHealthGrades is off", () => {
    const pillars = computePillars(
      inputs({ funnelVolume: 4, fedCapacity: fed({ headroom: 4 }) }),
      tuned
    );
    const trigger: TriggerRubric = {
      conditions: {
        capacity: { op: "atLeast", letter: "B" },
        groupHealth: { op: "atLeast", letter: "B" },
      },
      requireHealthGrades: false,
    };
    const signal = evaluateTrigger(trigger, pillars);
    expect(signal.ready).toBe(true);
    const groupOutcome = signal.outcomes.find(
      (o) => o.pillar === "groupHealth"
    );
    expect(groupOutcome?.status).toBe("skipped");
  });

  it("fails an ungraded health pillar when requireHealthGrades is on", () => {
    const pillars = computePillars(
      inputs({ funnelVolume: 4, fedCapacity: fed({ headroom: 4 }) }),
      tuned
    );
    const trigger: TriggerRubric = {
      conditions: { groupHealth: { op: "atLeast", letter: "B" } },
      requireHealthGrades: true,
    };
    const signal = evaluateTrigger(trigger, pillars);
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toEqual(["groupHealth"]);
  });

  it("produces no overall blended letter — only the ready flag + per-pillar outcomes", () => {
    const pillars = computePillars(inputs({ funnelVolume: 4 }), tuned);
    const signal = evaluateTrigger(
      { conditions: { interest: { op: "atLeast", letter: "B" } } },
      pillars
    );
    expect(signal).not.toHaveProperty("letter");
    expect(signal).not.toHaveProperty("overall");
    expect(signal).not.toHaveProperty("grade");
  });
});

describe("flagIndividualGroupMultiply — capacity-fed per-group flag", () => {
  it("flags when one or more groups of the type are full", () => {
    expect(flagIndividualGroupMultiply(fed({ fullGroupCount: 1 }))).toEqual({
      flagged: true,
      fullGroupCount: 1,
    });
  });

  it("does not flag when no group is full", () => {
    expect(flagIndividualGroupMultiply(fed({ fullGroupCount: 0 }))).toEqual({
      flagged: false,
      fullGroupCount: 0,
    });
  });

  it("is driven purely by the fed count, never by headroom or in-app counts", () => {
    // A type with healthy headroom can still have a single full group flagged.
    const flag = flagIndividualGroupMultiply(
      fed({ headroom: 10, fullGroupCount: 2 })
    );
    expect(flag.flagged).toBe(true);
    expect(flag.fullGroupCount).toBe(2);
  });

  it("sanitizes a negative / fractional / non-finite fed count to a safe integer", () => {
    expect(
      flagIndividualGroupMultiply(fed({ fullGroupCount: -3 })).flagged
    ).toBe(false);
    expect(
      flagIndividualGroupMultiply(fed({ fullGroupCount: 2.9 })).fullGroupCount
    ).toBe(2);
    expect(
      flagIndividualGroupMultiply(fed({ fullGroupCount: Number.NaN })).flagged
    ).toBe(false);
  });
});

describe("Overflow pillar — graded magnitude of full groups", () => {
  it("grades the full-group count against the overflow bands", () => {
    // Built-in overflow bands are { a: 3, b: 2, c: 1, d: 1 }.
    expect(
      computePillars(inputs({ fedCapacity: fed({ fullGroupCount: 3 }) }))
        .overflow
    ).toBe("A");
    expect(
      computePillars(inputs({ fedCapacity: fed({ fullGroupCount: 1 }) }))
        .overflow
    ).toBe("C");
    expect(
      computePillars(inputs({ fedCapacity: fed({ fullGroupCount: 0 }) }))
        .overflow
    ).toBe("F");
  });

  it("can gate the trigger as its own pillar, separate from Capacity", () => {
    const pillars = computePillars(
      inputs({ fedCapacity: fed({ headroom: 4, fullGroupCount: 0 }) }),
      { capacity: BANDS, overflow: BANDS, interest: BANDS }
    );
    // Capacity is an A (headroom 4) but Overflow is an F (no full groups).
    const signal = evaluateTrigger(
      { conditions: { overflow: { op: "atLeast", letter: "C" } } },
      pillars
    );
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toEqual(["overflow"]);
  });
});

describe("Capacity options — two offerable targets feed the pillar", () => {
  it("falls back to the largest option capacity when no headroom is fed", () => {
    const grades = computePillars(
      inputs({
        fedCapacity: fed({
          headroom: null,
          options: [
            { label: "Standard", capacity: 2 },
            { label: "Larger", capacity: 4 },
          ],
        }),
      }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    // Largest option capacity is 4 ⇒ A on the built-in capacity bands.
    expect(grades.capacity).toBe("A");
  });

  it("prefers an explicit fed headroom over the options", () => {
    const grades = computePillars(
      inputs({
        fedCapacity: fed({
          headroom: 1,
          options: [{ label: "Larger", capacity: 4 }],
        }),
      }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    // Headroom 1 wins over the option's 4 ⇒ D.
    expect(grades.capacity).toBe("D");
  });

  it("grades F when neither headroom nor any option capacity is set", () => {
    const grades = computePillars(
      inputs({ fedCapacity: fed({ headroom: null, options: [] }) }),
      BUILT_IN_PILLAR_THRESHOLDS
    );
    expect(grades.capacity).toBe("F");
  });
});

describe("Directional trigger conditions — health is not monotonic", () => {
  const tuned: PillarThresholds = {
    capacity: BANDS,
    overflow: BANDS,
    interest: BANDS,
  };

  it("fires 'atMost' on a LOW grade (e.g. a struggling leader needs a change)", () => {
    const pillars = computePillars(
      inputs({ leaderGrades: ["D", "F"] }), // rolls up to F
      tuned
    );
    const low = evaluateTrigger(
      { conditions: { leaderHealth: { op: "atMost", letter: "C" } } },
      pillars
    );
    expect(low.ready).toBe(true);
    // The same low grade does NOT clear an 'atLeast C'.
    const high = evaluateTrigger(
      { conditions: { leaderHealth: { op: "atLeast", letter: "C" } } },
      pillars
    );
    expect(high.ready).toBe(false);
  });

  it("fires 'between' only when the grade is inside the band, inclusive", () => {
    const pillars = computePillars(
      inputs({ groupGrades: ["C"] }), // rolls up to C
      tuned
    );
    expect(
      evaluateTrigger(
        {
          conditions: { groupHealth: { op: "between", best: "B", worst: "D" } },
        },
        pillars
      ).ready
    ).toBe(true);
    // A band that excludes C (only A–B) does not clear.
    expect(
      evaluateTrigger(
        {
          conditions: { groupHealth: { op: "between", best: "A", worst: "B" } },
        },
        pillars
      ).ready
    ).toBe(false);
  });
});

describe("decodeTriggerRubric — current shape + legacy fallback", () => {
  it("decodes the current 'conditions' shape across all ops", () => {
    const trigger = decodeTriggerRubric({
      conditions: {
        capacity: { op: "atLeast", letter: "B" },
        leaderHealth: { op: "atMost", letter: "C" },
        groupHealth: { op: "between", best: "B", worst: "D" },
      },
      requireHealthGrades: true,
    });
    expect(trigger.conditions.capacity).toEqual({ op: "atLeast", letter: "B" });
    expect(trigger.conditions.leaderHealth).toEqual({
      op: "atMost",
      letter: "C",
    });
    expect(trigger.conditions.groupHealth).toEqual({
      op: "between",
      best: "B",
      worst: "D",
    });
    expect(trigger.requireHealthGrades).toBe(true);
  });

  it("lifts a legacy 'minimums' map to 'atLeast' conditions (no backfill needed)", () => {
    const trigger = decodeTriggerRubric({
      minimums: { capacity: "B", interest: "C" },
      requireHealthGrades: false,
    });
    expect(trigger.conditions.capacity).toEqual({ op: "atLeast", letter: "B" });
    expect(trigger.conditions.interest).toEqual({ op: "atLeast", letter: "C" });
  });

  it("drops unknown pillars and invalid letters", () => {
    const trigger = decodeTriggerRubric({
      conditions: {
        capacity: { op: "atLeast", letter: "Z" },
        bogus: { op: "atLeast", letter: "A" },
      },
    });
    expect(trigger.conditions).toEqual({});
  });
});

describe("decodeFedCapacity — options decode", () => {
  it("decodes up to two options, dropping wholly-empty rows and clamping to two", () => {
    const decoded = decodeFedCapacity({
      headroom: 3,
      fullGroupCount: 1,
      options: [
        { label: "Standard", capacity: 12 },
        { label: "", capacity: null },
        { label: "Larger", capacity: 16 },
        { label: "Third", capacity: 20 },
      ],
    });
    expect(decoded.headroom).toBe(3);
    expect(decoded.fullGroupCount).toBe(1);
    expect(decoded.options).toEqual([
      { label: "Standard", capacity: 12 },
      { label: "Larger", capacity: 16 },
    ]);
  });

  it("defaults options to [] when the field is missing or not an array", () => {
    expect(decodeFedCapacity({ headroom: 1 }).options).toEqual([]);
    expect(decodeFedCapacity({ options: "nope" }).options).toEqual([]);
  });
});
