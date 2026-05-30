import { describe, expect, it } from "vitest";

import {
  buildCalendarEventsByGroup,
  computeCheckInDue,
  expectedMeetingDateForWeek,
  pickCalendarOverrideForOccurrence,
  type CheckInDueInput,
} from "@/lib/admin/check-in-due";
import { BUILT_IN_METRIC_DEFAULTS } from "@/lib/admin/metrics";
import type { GroupCalendarEventsRow } from "@/types/database";

// Saturday-evening group, default 24h offset → due Sunday 6pm Central.
const saturdayWeekly: CheckInDueInput = {
  meetingDay: "Saturday",
  meetingTime: "18:00:00",
  meetingFrequency: "weekly",
  meetingWeekParity: null,
};

function due(args: Partial<Parameters<typeof computeCheckInDue>[0]>) {
  return computeCheckInDue({
    group: saturdayWeekly,
    override: null,
    defaults: BUILT_IN_METRIC_DEFAULTS,
    ...args,
  });
}

describe("computeCheckInDue — cadence gate", () => {
  it("is not scheduled in an off-parity week for a biweekly group", () => {
    const result = due({
      group: { ...saturdayWeekly, meetingFrequency: "biweekly", meetingWeekParity: "even" },
      // Week 19 (odd) → an even-parity group does not meet.
      meetingWeek: "2026-05-04",
    });
    expect(result.isScheduledThisWeek).toBe(false);
    expect(result.due).toBeNull();
    expect(result.isOverdue).toBe(false);
  });

  it("is scheduled but undated when the day/time is missing", () => {
    const result = due({
      group: { ...saturdayWeekly, meetingTime: null },
      meetingWeek: "2026-05-04",
    });
    expect(result.isScheduledThisWeek).toBe(true);
    expect(result.due).toBeNull();
  });
});

describe("computeCheckInDue — calendar override", () => {
  it("an OFF override on the meeting occurrence suppresses the due date", () => {
    const result = due({
      meetingWeek: "2026-05-04",
      calendarOverride: { status: "off", date: "2026-05-09" },
    });
    expect(result.isScheduledThisWeek).toBe(false);
    expect(result.due).toBeNull();
  });

  it("a scheduled override falls through to normal cadence math", () => {
    const result = due({
      meetingWeek: "2026-05-04",
      calendarOverride: { status: "scheduled", date: "2026-05-09" },
    });
    expect(result.isScheduledThisWeek).toBe(true);
    expect(result.due).not.toBeNull();
  });
});

describe("computeCheckInDue — due instant + overdue", () => {
  it("places the due instant 24h after the meeting (Saturday 6pm → Sunday 6pm)", () => {
    // Reviewing ISO week starting Mon 2026-05-04; meeting Sat 2026-05-09 18:00.
    const result = due({
      meetingWeek: "2026-05-04",
      now: new Date("2026-05-09T23:00:00Z"), // before due
    });
    expect(result.offsetHours).toBe(24);
    expect(result.due).toMatchObject({
      year: 2026,
      month: 5,
      day: 10, // Sunday
      hour: 18,
      minute: 0,
    });
  });

  it("is overdue once the current church-local moment passes the due instant", () => {
    const before = due({
      meetingWeek: "2026-05-04",
      now: new Date("2026-05-10T22:00:00Z"), // 5pm Central Sun, before 6pm due
    });
    expect(before.isOverdue).toBe(false);
    expect(before.minutesUntilDue).toBeGreaterThan(0);

    const after = due({
      meetingWeek: "2026-05-04",
      now: new Date("2026-05-11T05:00:00Z"), // 12am Central Mon, past 6pm Sun due
    });
    expect(after.isOverdue).toBe(true);
    expect(after.minutesUntilDue).toBeLessThan(0);
  });

  it("respects a per-group offset override", () => {
    const result = due({
      override: { check_in_due_offset_hours_override: 48 },
      meetingWeek: "2026-05-04",
      now: new Date("2026-05-09T23:00:00Z"),
    });
    expect(result.offsetHours).toBe(48);
    // 48h after Sat 6pm → Monday 6pm.
    expect(result.due).toMatchObject({ day: 11, hour: 18 });
  });
});

describe("expectedMeetingDateForWeek", () => {
  it("anchors the cadence's meeting date inside the reviewed week", () => {
    expect(expectedMeetingDateForWeek("2026-05-04", saturdayWeekly)).toBe("2026-05-09");
  });

  it("returns null for an off-parity biweekly week", () => {
    expect(
      expectedMeetingDateForWeek("2026-05-04", {
        ...saturdayWeekly,
        meetingFrequency: "biweekly",
        meetingWeekParity: "even",
      }),
    ).toBeNull();
  });

  it("returns null when the meeting day is missing", () => {
    expect(
      expectedMeetingDateForWeek("2026-05-04", { ...saturdayWeekly, meetingDay: null }),
    ).toBeNull();
  });
});

describe("pickCalendarOverrideForOccurrence", () => {
  function event(over: Partial<GroupCalendarEventsRow>): GroupCalendarEventsRow {
    return {
      id: "evt-1",
      group_id: "grp-1",
      event_date: "2026-05-09",
      status: "scheduled",
      archived_at: null,
      event_type: "study",
      title: null,
      description: null,
      start_time: null,
      end_time: null,
      created_at: "2026-05-01T00:00:00Z",
      created_by: null,
      updated_at: null,
      updated_by: null,
      ...over,
    } as GroupCalendarEventsRow;
  }

  it("returns null when no occurrence date is supplied", () => {
    const byGroup = buildCalendarEventsByGroup([event({})]);
    expect(pickCalendarOverrideForOccurrence(byGroup.get("grp-1") ?? [], null)).toBeNull();
  });

  it("matches the active row on the occurrence date and ignores archived rows", () => {
    const byGroup = buildCalendarEventsByGroup([
      event({ id: "a", status: "off", archived_at: "2026-05-02T00:00:00Z" }),
      event({ id: "b", status: "off" }),
    ]);
    const picked = pickCalendarOverrideForOccurrence(byGroup.get("grp-1") ?? [], "2026-05-09");
    expect(picked).toEqual({ status: "off", date: "2026-05-09" });
  });

  it("prefers a scheduled row over an off row when both land on the date", () => {
    const byGroup = buildCalendarEventsByGroup([
      event({ id: "z", status: "off" }),
      event({ id: "a", status: "scheduled" }),
    ]);
    const picked = pickCalendarOverrideForOccurrence(byGroup.get("grp-1") ?? [], "2026-05-09");
    expect(picked?.status).toBe("scheduled");
  });
});
