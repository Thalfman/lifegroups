import { describe, expect, it } from "vitest";

import {
  generateOccurrencesInRange,
  mergeOverrides,
  type GeneratedOccurrence,
  type GroupSchedule,
  type SavedOverride,
} from "@/lib/calendar/occurrences";

const weekly: GroupSchedule = {
  meetingDay: "Saturday",
  meetingTime: "18:00:00",
  meetingFrequency: "weekly",
  meetingWeekParity: null,
};

describe("generateOccurrencesInRange — cadence", () => {
  it("returns nothing when the schedule is incomplete", () => {
    expect(
      generateOccurrencesInRange(
        { ...weekly, meetingDay: null },
        "2026-05-01",
        "2026-05-31",
      ),
    ).toEqual([]);
    expect(
      generateOccurrencesInRange(
        { ...weekly, meetingTime: null },
        "2026-05-01",
        "2026-05-31",
      ),
    ).toEqual([]);
  });

  it("returns nothing for an inverted range", () => {
    expect(generateOccurrencesInRange(weekly, "2026-05-31", "2026-05-01")).toEqual([]);
  });

  it("emits every matching weekday for a weekly group, time normalised to HH:mm", () => {
    const occ = generateOccurrencesInRange(weekly, "2026-05-01", "2026-05-31");
    expect(occ.map((o) => o.date)).toEqual([
      "2026-05-02",
      "2026-05-09",
      "2026-05-16",
      "2026-05-23",
      "2026-05-30",
    ]);
    expect(occ.every((o) => o.meetingTime === "18:00")).toBe(true);
  });

  it("emits only matching-parity weeks for a biweekly group", () => {
    // Saturdays in May 2026 fall in ISO weeks 18,19,20,21,22.
    // odd parity → weeks 19 and 21 → 2026-05-09 and 2026-05-23.
    const odd = generateOccurrencesInRange(
      { ...weekly, meetingFrequency: "biweekly", meetingWeekParity: "odd" },
      "2026-05-01",
      "2026-05-31",
    );
    expect(odd.map((o) => o.date)).toEqual(["2026-05-09", "2026-05-23"]);

    const even = generateOccurrencesInRange(
      { ...weekly, meetingFrequency: "biweekly", meetingWeekParity: "even" },
      "2026-05-01",
      "2026-05-31",
    );
    expect(even.map((o) => o.date)).toEqual([
      "2026-05-02",
      "2026-05-16",
      "2026-05-30",
    ]);
  });

  it("surfaces every matching weekday when biweekly parity is unset (a data gap, not hidden)", () => {
    const occ = generateOccurrencesInRange(
      { ...weekly, meetingFrequency: "biweekly", meetingWeekParity: null },
      "2026-05-01",
      "2026-05-31",
    );
    expect(occ).toHaveLength(5);
  });

  it("emits only the first matching weekday of the month for a monthly group", () => {
    const occ = generateOccurrencesInRange(
      { ...weekly, meetingFrequency: "monthly" },
      "2026-05-01",
      "2026-05-31",
    );
    expect(occ.map((o) => o.date)).toEqual(["2026-05-02"]);
  });
});

describe("mergeOverrides", () => {
  const gen: GeneratedOccurrence[] = [
    { date: "2026-05-02", meetingTime: "18:00", isMeetingOccurrence: true },
    { date: "2026-05-09", meetingTime: "18:00", isMeetingOccurrence: true },
  ];

  it("defaults an un-overridden generated date to a scheduled study", () => {
    const [resolved] = mergeOverrides([gen[0]], [], "18:00");
    expect(resolved).toMatchObject({
      date: "2026-05-02",
      isMeetingOccurrence: true,
      eventType: "study",
      status: "scheduled",
      overrideId: null,
      meetingTime: "18:00",
    });
  });

  it("lets a saved row override the gathering type/status on a generated date, keeping the schedule time", () => {
    const saved: SavedOverride = {
      id: "ovr-1",
      date: "2026-05-09",
      eventType: "social",
      status: "off",
      title: "No meeting",
      description: null,
    };
    const resolved = mergeOverrides(gen, [saved], "18:00");
    const may9 = resolved.find((r) => r.date === "2026-05-09");
    expect(may9).toMatchObject({
      eventType: "social",
      status: "off",
      overrideId: "ovr-1",
      isMeetingOccurrence: true,
      meetingTime: "18:00", // schedule time wins, override carries no time
    });
  });

  it("adds a saved row on a non-generated date as a one-off, sorted by date", () => {
    const oneOff: SavedOverride = {
      id: "ovr-2",
      date: "2026-05-05",
      eventType: "service",
      status: "scheduled",
      title: "Serve night",
      description: "Food pantry",
    };
    const resolved = mergeOverrides(gen, [oneOff], "18:00");
    expect(resolved.map((r) => r.date)).toEqual([
      "2026-05-02",
      "2026-05-05",
      "2026-05-09",
    ]);
    const may5 = resolved.find((r) => r.date === "2026-05-05");
    expect(may5).toMatchObject({
      isMeetingOccurrence: false,
      eventType: "service",
      overrideId: "ovr-2",
      meetingTime: "18:00", // inherited from group schedule
    });
  });
});
