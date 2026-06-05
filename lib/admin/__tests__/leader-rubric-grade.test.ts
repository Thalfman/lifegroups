import { describe, expect, it } from "vitest";

import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { computeGrade, type Rubric } from "@/lib/admin/health-rubric";
import { ministryYearOf } from "@/lib/admin/ministry-year";

// Leader-Health Grade facade (#378 / ADR 0018, pivot slice 5). Pure: it reuses
// the shared rubric engine (computeGrade) and override resolver (resolveGrade),
// so these tests assert the FACADE's contract — the roll-up matches the engine,
// override precedence honours both scopes against the ministry-year period, and
// the ministry-year keying is echoed back — not the engine math itself (already
// covered by health-rubric.test.ts).

const RUBRIC: Rubric = {
  criteria: [
    { key: "walk", label: "Walk with God", weight: 50 },
    { key: "team", label: "Team development", weight: 30 },
    { key: "care", label: "Member care", weight: 20 },
  ],
};

// The first-of-month for a date inside ministry year 2025 (Aug 2025 → May 2026).
const PERIOD_FEB_2026 = "2026-02-01";

describe("resolveLeaderGrade — roll-up matches the shared engine", () => {
  it("computes the same numeric + letter the engine does, with no override", () => {
    const scores = { walk: 92, team: 88, care: 80 };
    const engine = computeGrade(RUBRIC, scores);

    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });

    expect(resolved.numeric).toBe(engine.numeric);
    expect(resolved.letter).toBe(engine.letter);
    expect(resolved.computed_letter).toBe(engine.letter);
    expect(resolved.overridden).toBe(false);
    expect(resolved.override_scope).toBeNull();
  });

  it("bands a clear A (all-90s) the way the engine does", () => {
    const scores = { walk: 95, team: 95, care: 95 };
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.letter).toBe("A");
    expect(resolved.computed_letter).toBe("A");
  });

  it("can compute a failing F (the A–F scale)", () => {
    const scores = { walk: 40, team: 50, care: 30 };
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.letter).toBe("F");
  });
});

describe("resolveLeaderGrade — override precedence (both scopes)", () => {
  it("an until_cleared override forces the letter and is always active", () => {
    const scores = { walk: 95, team: 95, care: 95 }; // computes A
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: {
        letter: "C",
        scope: "until_cleared",
        period_month: "2025-09-01",
      },
      ministryYear: 2025,
      // A different month than the override was set for: until_cleared ignores it.
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.letter).toBe("C");
    expect(resolved.computed_letter).toBe("A");
    expect(resolved.overridden).toBe(true);
    expect(resolved.override_scope).toBe("until_cleared");
  });

  it("a this_month override is active only in the month it was set for", () => {
    const scores = { walk: 95, team: 95, care: 95 }; // computes A
    const active = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: {
        letter: "D",
        scope: "this_month",
        period_month: PERIOD_FEB_2026,
      },
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(active.letter).toBe("D");
    expect(active.overridden).toBe(true);
    expect(active.override_scope).toBe("this_month");
  });

  it("an expired this_month override falls back to the computed letter", () => {
    const scores = { walk: 95, team: 95, care: 95 }; // computes A
    const expired = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      // Set for September, but resolved in February: expired.
      override: {
        letter: "D",
        scope: "this_month",
        period_month: "2025-09-01",
      },
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(expired.letter).toBe("A");
    expect(expired.computed_letter).toBe("A");
    expect(expired.overridden).toBe(false);
    expect(expired.override_scope).toBeNull();
  });

  it("keeps the computed letter visible alongside an active override", () => {
    const scores = { walk: 40, team: 50, care: 30 }; // computes F
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: {
        letter: "B",
        scope: "until_cleared",
        period_month: PERIOD_FEB_2026,
      },
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.letter).toBe("B");
    expect(resolved.computed_letter).toBe("F");
  });
});

describe("resolveLeaderGrade — ministry-year keying", () => {
  it("echoes the ministry year back unchanged", () => {
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores: { walk: 90, team: 90, care: 90 },
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.ministry_year).toBe(2025);
  });

  it("agrees with ministryYearOf for the period month it is keyed to", () => {
    // Feb 2026 belongs to ministry year 2025 (Aug 2025 → May 2026).
    const located = ministryYearOf(new Date(Date.UTC(2026, 1, 1)));
    expect(located.year).toBe(2025);
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores: { walk: 90, team: 90, care: 90 },
      override: null,
      ministryYear: located.year ?? -1,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.ministry_year).toBe(2025);
  });
});

describe("resolveLeaderGrade — partial scores", () => {
  it("renormalizes over the scored criteria (drops the unscored weight)", () => {
    // Only `walk` (weight 50) scored: the engine grades on it alone.
    const scores = { walk: 84 };
    const engine = computeGrade(RUBRIC, scores);
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores,
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.numeric).toBe(84);
    expect(resolved.numeric).toBe(engine.numeric);
    expect(resolved.letter).toBe("B");
  });

  it("returns a null grade when no criterion is scored yet", () => {
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores: {},
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.numeric).toBeNull();
    expect(resolved.letter).toBeNull();
    expect(resolved.computed_letter).toBeNull();
  });

  it("an override still applies even when no criterion is scored", () => {
    const resolved = resolveLeaderGrade({
      rubric: RUBRIC,
      scores: {},
      override: {
        letter: "A",
        scope: "until_cleared",
        period_month: PERIOD_FEB_2026,
      },
      ministryYear: 2025,
      currentPeriodMonth: PERIOD_FEB_2026,
    });
    expect(resolved.letter).toBe("A");
    expect(resolved.computed_letter).toBeNull();
    expect(resolved.overridden).toBe(true);
  });
});
