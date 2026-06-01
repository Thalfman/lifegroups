import { describe, expect, it } from "vitest";

import {
  CHURCH_TIMEZONE,
  churchDayStartUtcIso,
  churchMonthIso,
  churchTodayIso,
  isoWeekNumberOf,
  isoWeekStart,
} from "@/lib/shared/church-time";

describe("CHURCH_TIMEZONE", () => {
  it("anchors the whole app on US Central", () => {
    expect(CHURCH_TIMEZONE).toBe("America/Chicago");
  });
});

describe("isoWeekNumberOf", () => {
  it("returns null for an unparseable date", () => {
    expect(isoWeekNumberOf("not-a-date")).toBeNull();
    expect(isoWeekNumberOf("2026-13-40")).toBeNull();
  });

  it("numbers the first full ISO week as 1", () => {
    // 2026-01-01 is a Thursday → ISO week 1.
    expect(isoWeekNumberOf("2026-01-01")).toBe(1);
    // Monday of that same ISO week (2025-12-29).
    expect(isoWeekNumberOf("2025-12-29")).toBe(1);
  });

  it("handles the year-boundary week belonging to the previous year", () => {
    // 2023-01-01 is a Sunday → still ISO week 52 of 2022.
    expect(isoWeekNumberOf("2023-01-01")).toBe(52);
  });

  it("recognises 53-week years", () => {
    // 2020 is a 53-week ISO year; 2020-12-31 (Thursday) is week 53.
    expect(isoWeekNumberOf("2020-12-31")).toBe(53);
  });

  it("produces alternating parity across consecutive weeks (drives biweekly cadence)", () => {
    const a = isoWeekNumberOf("2026-05-04"); // a Monday
    const b = isoWeekNumberOf("2026-05-11"); // next Monday
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect((a as number) % 2).not.toBe((b as number) % 2);
  });
});

describe("isoWeekStart", () => {
  it("returns the Monday for a string calendar date, mid-week", () => {
    // 2026-05-06 is a Wednesday → Monday is 2026-05-04.
    expect(isoWeekStart("2026-05-06")).toBe("2026-05-04");
  });

  it("treats Sunday as the end of the ISO week, not the start", () => {
    // 2026-05-10 is a Sunday → its ISO week began Monday 2026-05-04.
    expect(isoWeekStart("2026-05-10")).toBe("2026-05-04");
  });

  it("returns the same Monday when given a Monday", () => {
    expect(isoWeekStart("2026-05-04")).toBe("2026-05-04");
  });

  it("projects a Date into church-local time before taking the weekday", () => {
    // Sunday 2026-05-10 23:30 US Central is 2026-05-11 04:30 UTC. The
    // church-local day is still Sunday the 10th, so the ISO week start is
    // 2026-05-04 — not 2026-05-11 (which is what a naive UTC read gives).
    const lateSundayCentral = new Date("2026-05-11T04:30:00Z");
    expect(isoWeekStart(lateSundayCentral)).toBe("2026-05-04");
  });
});

describe("churchTodayIso / churchMonthIso", () => {
  it("reads the church-local calendar day across the UTC midnight boundary", () => {
    // 2026-05-11 02:00 UTC is 2026-05-10 21:00 US Central → still the 10th.
    const justAfterUtcMidnight = new Date("2026-05-11T02:00:00Z");
    expect(churchTodayIso(justAfterUtcMidnight)).toBe("2026-05-10");
    expect(churchMonthIso(justAfterUtcMidnight)).toBe("2026-05");
  });

  it("rolls the church month over only on the church-local first", () => {
    // 2026-06-01 02:00 UTC is still 2026-05-31 in US Central.
    const utcFirstButCentralLast = new Date("2026-06-01T02:00:00Z");
    expect(churchTodayIso(utcFirstButCentralLast)).toBe("2026-05-31");
    expect(churchMonthIso(utcFirstButCentralLast)).toBe("2026-05");
  });
});

describe("churchDayStartUtcIso", () => {
  it("maps a church-local day to its UTC midnight instant in CDT (summer)", () => {
    // America/Chicago is UTC-5 in June, so 00:00 local = 05:00 UTC.
    expect(churchDayStartUtcIso("2026-06-01")).toBe("2026-06-01T05:00:00.000Z");
  });

  it("maps a church-local day to its UTC midnight instant in CST (winter)", () => {
    // UTC-6 in January, so 00:00 local = 06:00 UTC.
    expect(churchDayStartUtcIso("2026-01-15")).toBe("2026-01-15T06:00:00.000Z");
  });

  it("round-trips with churchTodayIso for an evening-local instant", () => {
    // A timestamp at 03:00 UTC on Jun 1 is 22:00 local on May 31, so it must
    // fall in [start of May 31, start of Jun 1) church-local.
    const completedAt = new Date("2026-06-01T03:00:00Z");
    expect(churchTodayIso(completedAt)).toBe("2026-05-31");
    const lower = churchDayStartUtcIso("2026-05-31");
    const upper = churchDayStartUtcIso("2026-06-01");
    expect(completedAt.toISOString() >= lower).toBe(true);
    expect(completedAt.toISOString() < upper).toBe(true);
  });
});
