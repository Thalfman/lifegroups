import { describe, expect, it } from "vitest";
import {
  groupCalendarLinkName,
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

describe("groupCalendarLinkName", () => {
  it("names the group and carries the leader-section context", () => {
    const name = groupCalendarLinkName({
      groupId: "grp-anderson",
      groupName: "Anderson",
      leaderName: "Pat Lee",
    });
    expect(name).toBe("Open Anderson calendar — led by Pat Lee (grp-anderson)");
  });

  it("labels the Unassigned bucket without a leader clause", () => {
    const name = groupCalendarLinkName({
      groupId: "grp-x",
      groupName: "Bryant",
      leaderName: null,
    });
    expect(name).toBe("Open Bryant calendar — unassigned (grp-x)");
  });

  it("stays unique for two same-named groups even under the same leader", () => {
    // The "By leader" view drops the per-occurrence date discriminator the list
    // link uses, so two same-named groups would both expose a bare "Open <name>
    // calendar". The group-id suffix keeps the accessible names distinct (#331).
    const a = groupCalendarLinkName({
      groupId: "grp-sun-a",
      groupName: "Sunday Night",
      leaderName: "Dana Cole",
    });
    const b = groupCalendarLinkName({
      groupId: "grp-sun-b",
      groupName: "Sunday Night",
      leaderName: "Dana Cole",
    });
    expect(a).not.toBe(b);
  });
});
