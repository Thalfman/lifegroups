import { describe, expect, it } from "vitest";

import {
  currentMinistryYear,
  currentPeriodMonthIso,
  isInMinistryYear,
  ministryYearOf,
} from "@/lib/admin/ministry-year";

// Ministry Year (#374 / ADR 0018): Aug–May window, named by the August-start
// calendar year; Jun/Jul are the off-season (no ministry year). Dates built in
// UTC since the util reads UTC fields.
const utc = (y: number, m1: number, d = 15): Date =>
  new Date(Date.UTC(y, m1 - 1, d));

describe("ministryYearOf — Aug–May window", () => {
  it("Aug–Dec belong to that calendar year's ministry year", () => {
    expect(ministryYearOf(utc(2025, 8)).year).toBe(2025); // August
    expect(ministryYearOf(utc(2025, 12)).year).toBe(2025); // December
  });

  it("Jan–May belong to the PRIOR calendar year's ministry year", () => {
    expect(ministryYearOf(utc(2026, 1)).year).toBe(2025); // January
    expect(ministryYearOf(utc(2026, 5)).year).toBe(2025); // May
  });

  it("Jun and Jul are the off-season (no ministry year)", () => {
    expect(ministryYearOf(utc(2026, 6)).year).toBeNull();
    expect(ministryYearOf(utc(2026, 7)).year).toBeNull();
  });

  it("the year flips on Aug 1, not Jan 1", () => {
    // July 31 2025 is off-season; Aug 1 2025 starts the 2025 ministry year.
    expect(ministryYearOf(utc(2025, 7, 31)).year).toBeNull();
    expect(ministryYearOf(utc(2025, 8, 1)).year).toBe(2025);
  });
});

describe("isInMinistryYear — membership", () => {
  it("a Sep date is in the year named by its August start", () => {
    expect(isInMinistryYear(utc(2025, 9), 2025)).toBe(true);
    expect(isInMinistryYear(utc(2025, 9), 2024)).toBe(false);
  });

  it("a Feb date is in the prior calendar year's ministry year", () => {
    expect(isInMinistryYear(utc(2026, 2), 2025)).toBe(true);
    expect(isInMinistryYear(utc(2026, 2), 2026)).toBe(false);
  });

  it("an off-season date is in no ministry year", () => {
    expect(isInMinistryYear(utc(2026, 7), 2025)).toBe(false);
    expect(isInMinistryYear(utc(2026, 7), 2026)).toBe(false);
  });
});

// The "current" helpers anchor to the church wall clock (America/Chicago), not
// UTC. From ~6-7 PM Central on the last day of a month, UTC is already
// tomorrow; a UTC anchor keyed evening grade writes into the next month's
// assessment row — and at the May→June boundary into the off-season.
describe("currentPeriodMonthIso / currentMinistryYear — church-local anchor", () => {
  // 2026-06-01T01:00Z is 8 PM May 31 Central (CDT, UTC-5).
  const may31Evening = new Date("2026-06-01T01:00:00Z");
  // 2026-06-01T14:00Z is 9 AM June 1 Central — genuinely June.
  const june1Morning = new Date("2026-06-01T14:00:00Z");

  it("keys a late-evening month-end instant to the church-local month", () => {
    expect(currentPeriodMonthIso(may31Evening)).toBe("2026-05-01");
    expect(currentPeriodMonthIso(june1Morning)).toBe("2026-06-01");
  });

  it("stays in the ministry year through the evening of May 31", () => {
    expect(currentMinistryYear(may31Evening)).toBe(2025);
    expect(currentMinistryYear(june1Morning)).toBeNull(); // June off-season
  });
});
