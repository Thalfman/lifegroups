import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PILLAR_THRESHOLDS,
  computePillars,
  decodeTriggerRubric,
  evaluateTrigger,
  gradeNumericPillar,
  rollUpGrades,
  type HealthLetter,
  type PillarBands,
  type PillarInputs,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";

// Pure-resolver tests for the Multiply pillars + trigger (#380, updated #401). No
// DB: each rule is exercised with bare objects — per-pillar A–F grading from
// inputs + thresholds, the Ministry-Year health roll-ups, trigger evaluation, and
// the empty-grades "—" (null) path. Capacity is no longer an A–F pillar here — it
// is the derived per-cell issue (lib/admin/cell-capacity.ts), tested separately.

const BANDS: PillarBands = { a: 4, b: 3, c: 2, d: 1 };

function inputs(over: Partial<PillarInputs> = {}): PillarInputs {
  return {
    funnelVolume: 0,
    groupGrades: [],
    leaderGrades: [],
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

describe("computePillars — A–F pillars per type", () => {
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

  it("no longer grades a capacity pillar (capacity is the derived per-cell issue)", () => {
    const grades = computePillars(inputs(), BUILT_IN_PILLAR_THRESHOLDS);
    expect(grades).not.toHaveProperty("capacity");
    expect(grades).not.toHaveProperty("overflow");
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
    const grades = computePillars(inputs({ funnelVolume: 3 }));
    expect(grades.interest).toBe("B");
  });
});

describe("evaluateTrigger — configurable multiply signal (no blended letter)", () => {
  const tuned: PillarThresholds = {
    interest: BANDS,
  };

  it("is ready when every required pillar clears its minimum", () => {
    const pillars = computePillars(
      inputs({
        funnelVolume: 4,
        groupGrades: ["A"],
        leaderGrades: ["A"],
      }),
      tuned
    );
    const trigger: TriggerRubric = {
      conditions: {
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
    const pillars = computePillars(inputs({ funnelVolume: 1 }), tuned);
    const trigger: TriggerRubric = {
      conditions: {
        interest: { op: "atLeast", letter: "B" },
      },
    };
    const signal = evaluateTrigger(trigger, pillars);
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("interest");
  });

  it("ignores pillars not named in the trigger", () => {
    const pillars = computePillars(inputs({ funnelVolume: 4 }), tuned);
    // Only interest is in the trigger; the ungraded health pillars are irrelevant.
    const signal = evaluateTrigger(
      { conditions: { interest: { op: "atLeast", letter: "B" } } },
      pillars
    );
    expect(signal.ready).toBe(true);
    expect(signal.outcomes.map((o) => o.pillar)).toEqual(["interest"]);
  });

  it("skips an ungraded health pillar when requireHealthGrades is off", () => {
    const pillars = computePillars(inputs({ funnelVolume: 4 }), tuned);
    const trigger: TriggerRubric = {
      conditions: {
        interest: { op: "atLeast", letter: "B" },
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
    const pillars = computePillars(inputs({ funnelVolume: 4 }), tuned);
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

describe("evaluateTrigger — capacity gates readiness (PRD §2.4)", () => {
  const tuned: PillarThresholds = { interest: BANDS };
  const cleared = () => computePillars(inputs({ funnelVolume: 4 }), tuned);
  const interestAtLeastB: TriggerRubric = {
    conditions: { interest: { op: "atLeast", letter: "B" } },
  };

  it("blocks ready when capacity is required (the default) and an issue is present", () => {
    const signal = evaluateTrigger(interestAtLeastB, cleared(), {
      isIssue: true,
    });
    expect(signal.ready).toBe(false);
    expect(signal.blockers).toContain("capacity");
  });

  it("treats capacity as required when the flag is omitted (PRD default)", () => {
    // No requireCapacity field at all — still gates on the issue.
    const signal = evaluateTrigger(interestAtLeastB, cleared(), {
      isIssue: true,
    });
    expect(signal.ready).toBe(false);
  });

  it("stays ready when capacity is required but there is no issue", () => {
    const signal = evaluateTrigger(interestAtLeastB, cleared(), {
      isIssue: false,
    });
    expect(signal.ready).toBe(true);
    expect(signal.blockers).not.toContain("capacity");
  });

  it("ignores capacity entirely when requireCapacity is false", () => {
    const signal = evaluateTrigger(
      { ...interestAtLeastB, requireCapacity: false },
      cleared(),
      { isIssue: true }
    );
    expect(signal.ready).toBe(true);
    expect(signal.blockers).not.toContain("capacity");
  });

  it("does not gate on capacity when no capacity issue is supplied", () => {
    // Omitting the capacity arg leaves capacity out of the gate (back-compat).
    const signal = evaluateTrigger(interestAtLeastB, cleared());
    expect(signal.ready).toBe(true);
  });

  it("keeps capacity out of the per-pillar outcomes — it surfaces only as a blocker", () => {
    const signal = evaluateTrigger(interestAtLeastB, cleared(), {
      isIssue: true,
    });
    expect(signal.outcomes.map((o) => o.pillar)).not.toContain("capacity");
    expect(signal.blockers).toEqual(["capacity"]);
  });
});

describe("Directional trigger conditions — health is not monotonic", () => {
  const tuned: PillarThresholds = {
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
        interest: { op: "atLeast", letter: "B" },
        leaderHealth: { op: "atMost", letter: "C" },
        groupHealth: { op: "between", best: "B", worst: "D" },
      },
      requireHealthGrades: true,
    });
    expect(trigger.conditions.interest).toEqual({ op: "atLeast", letter: "B" });
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
      minimums: { interest: "C", groupHealth: "B" },
      requireHealthGrades: false,
    });
    expect(trigger.conditions.interest).toEqual({ op: "atLeast", letter: "C" });
    expect(trigger.conditions.groupHealth).toEqual({
      op: "atLeast",
      letter: "B",
    });
  });

  it("drops unknown pillars, invalid letters, and the retired capacity/overflow pillars", () => {
    const trigger = decodeTriggerRubric({
      conditions: {
        interest: { op: "atLeast", letter: "Z" },
        bogus: { op: "atLeast", letter: "A" },
        // capacity + overflow are no longer trigger pillars (#401) — dropped.
        capacity: { op: "atLeast", letter: "B" },
        overflow: { op: "atLeast", letter: "B" },
      },
    });
    expect(trigger.conditions).toEqual({});
  });

  it("defaults requireCapacity to true, and reads an explicit false", () => {
    // Capacity gates by default (PRD §2.4 / §4.1) for a row that omits the flag.
    expect(decodeTriggerRubric({ conditions: {} }).requireCapacity).toBe(true);
    // A non-boolean is ignored and falls back to the required default.
    expect(
      decodeTriggerRubric({ conditions: {}, requireCapacity: "no" })
        .requireCapacity
    ).toBe(true);
    // An explicit false turns the capacity gate off.
    expect(
      decodeTriggerRubric({ conditions: {}, requireCapacity: false })
        .requireCapacity
    ).toBe(false);
  });
});
