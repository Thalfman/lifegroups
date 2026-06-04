import { describe, expect, it } from "vitest";
import {
  careActionAccessibleName,
  resolveContactNextAction,
  resolveOpenFollowUpNextAction,
  type CareContactState,
} from "@/lib/admin/care-next-action";

const COVERED_AND_SCHEDULED: CareContactState = {
  hasOverShepherd: true,
  hasScheduledTouchpoint: true,
};

describe("resolveContactNextAction", () => {
  it("assigns an over-shepherd first when the leader is uncovered", () => {
    // Precedence: coverage before cadence — an uncovered leader needs an
    // over-shepherd before logging a one-off contact makes sense. Even with a
    // touchpoint set, the missing coverage wins.
    const r = resolveContactNextAction({
      hasOverShepherd: false,
      hasScheduledTouchpoint: true,
    });
    expect(r.action).toBe("assign-over-shepherd");
    expect(r.label).toBe("Assign over-shepherd");
    expect(r.tab).toBe("overview");
  });

  it("schedules a touchpoint when covered but no touchpoint is set", () => {
    const r = resolveContactNextAction({
      hasOverShepherd: true,
      hasScheduledTouchpoint: false,
    });
    expect(r.action).toBe("schedule-touchpoint");
    expect(r.label).toBe("Schedule touchpoint");
    expect(r.tab).toBe("overview");
  });

  it("logs contact once the leader is covered and has a touchpoint", () => {
    const r = resolveContactNextAction(COVERED_AND_SCHEDULED);
    expect(r.action).toBe("log-contact");
    expect(r.label).toBe("Log contact");
    expect(r.tab).toBe("overview");
  });

  it("treats missing coverage as the highest-precedence gap", () => {
    // Both gaps open at once still resolves to coverage.
    const r = resolveContactNextAction({
      hasOverShepherd: false,
      hasScheduledTouchpoint: false,
    });
    expect(r.action).toBe("assign-over-shepherd");
  });
});

describe("resolveOpenFollowUpNextAction", () => {
  it("resolves an open follow-up on the Follow-ups tab", () => {
    const r = resolveOpenFollowUpNextAction();
    expect(r.action).toBe("resolve-follow-up");
    expect(r.label).toBe("Resolve follow-up");
    expect(r.tab).toBe("follow-ups");
  });
});

describe("careActionAccessibleName", () => {
  it("builds a record-context name from the verb + person", () => {
    expect(careActionAccessibleName("Log contact", "Jane Doe")).toBe(
      "Log contact for Jane Doe"
    );
  });
});
