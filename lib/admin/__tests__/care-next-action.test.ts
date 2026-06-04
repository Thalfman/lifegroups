import { describe, expect, it } from "vitest";
import {
  careActionAccessibleName,
  resolveAttentionNextAction,
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

describe("resolveAttentionNextAction", () => {
  it("routes an overdue-care-follow-up primary reason to Resolve follow-up", () => {
    // Even when the leader is covered and has a scheduled touchpoint (so the
    // contact precedence would otherwise pick Log contact), an item flagged
    // primarily for an overdue care follow-up must resolve to the follow-up
    // path on the Follow-ups tab (#332).
    const r = resolveAttentionNextAction(
      "overdue_care_follow_up",
      COVERED_AND_SCHEDULED
    );
    expect(r.action).toBe("resolve-follow-up");
    expect(r.label).toBe("Resolve follow-up");
    expect(r.tab).toBe("follow-ups");
  });

  it("still routes to the follow-up path when coverage/touchpoint gaps also exist", () => {
    // The overdue follow-up wins over the uncovered/no-touchpoint gaps.
    const r = resolveAttentionNextAction("overdue_care_follow_up", {
      hasOverShepherd: false,
      hasScheduledTouchpoint: false,
    });
    expect(r.action).toBe("resolve-follow-up");
    expect(r.tab).toBe("follow-ups");
  });

  it("falls back to the contact precedence for any other primary reason", () => {
    expect(
      resolveAttentionNextAction("no_contact_yet", COVERED_AND_SCHEDULED).action
    ).toBe("log-contact");
    expect(
      resolveAttentionNextAction("no_over_shepherd", {
        hasOverShepherd: false,
        hasScheduledTouchpoint: true,
      }).action
    ).toBe("assign-over-shepherd");
    expect(
      resolveAttentionNextAction("overdue_touchpoint", {
        hasOverShepherd: true,
        hasScheduledTouchpoint: false,
      }).action
    ).toBe("schedule-touchpoint");
  });
});

describe("careActionAccessibleName", () => {
  it("builds a record-context name from the verb + person", () => {
    expect(careActionAccessibleName("Log contact", "Jane Doe")).toBe(
      "Log contact for Jane Doe"
    );
  });
});
