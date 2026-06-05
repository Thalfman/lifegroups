import { describe, expect, it } from "vitest";

import { isInMinistryYear, ministryYearOf } from "@/lib/admin/ministry-year";

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
