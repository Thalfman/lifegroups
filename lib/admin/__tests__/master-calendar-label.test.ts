import { describe, expect, it } from "vitest";
import {
  occurrenceAccessibleName,
  occurrenceCalendarLinkName,
} from "@/lib/admin/master-calendar-label";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// A scheduled weekly meeting occurrence; each test overrides only what it cares
// about so the label builder is exercised in isolation.
function occ(overrides: Partial<MasterOccurrence> = {}): MasterOccurrence {
  return {
    groupId: "grp-1",
    groupName: "Sunday Night",
    lifecycleStatus: "active",
    meetingDay: "Tuesday",
    meetingTime: "19:00",
    meetingFrequency: "weekly",
    meetingWeekParity: null,
    leaders: [{ profileId: "p-1", name: "Dana Cole" }],
    date: "2026-05-12",
    weekdayIndex: 2,
    inheritedMeetingTime: "19:00",
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
    isGenerated: true,
    isMeetingOccurrence: true,
    ...overrides,
  };
}

describe("occurrenceAccessibleName", () => {
  it("leads with the verb, group, and date", () => {
    const name = occurrenceAccessibleName(occ());
    expect(name.startsWith("View Sunday Night on ")).toBe(true);
  });

  it("carries a leader discriminator so same-name/same-date groups stay unique", () => {
    // Two DIFFERENT groups, identical name/date/type/time/status — group names
    // are not unique, so only the leader keeps the accessible names distinct.
    const a = occurrenceAccessibleName(
      occ({
        groupId: "grp-a",
        leaders: [{ profileId: "a", name: "Dana Cole" }],
      })
    );
    const b = occurrenceAccessibleName(
      occ({ groupId: "grp-b", leaders: [{ profileId: "b", name: "Sam Reed" }] })
    );
    expect(a).toContain("led by Dana Cole");
    expect(b).toContain("led by Sam Reed");
    expect(a).not.toBe(b);
  });

  it("omits the leader clause when the group has no leaders", () => {
    expect(occurrenceAccessibleName(occ({ leaders: [] }))).not.toContain(
      "led by"
    );
  });

  it("honors the verb override", () => {
    expect(occurrenceAccessibleName(occ(), "Edit").startsWith("Edit ")).toBe(
      true
    );
  });
});

describe("occurrenceCalendarLinkName", () => {
  it("names the group + date and carries the same leader discriminator", () => {
    const a = occurrenceCalendarLinkName(
      occ({
        groupId: "grp-a",
        leaders: [{ profileId: "a", name: "Dana Cole" }],
      })
    );
    const b = occurrenceCalendarLinkName(
      occ({ groupId: "grp-b", leaders: [{ profileId: "b", name: "Sam Reed" }] })
    );
    expect(a.startsWith("Open Sunday Night calendar — ")).toBe(true);
    expect(a).toContain("led by Dana Cole");
    expect(a).not.toBe(b);
  });
});
