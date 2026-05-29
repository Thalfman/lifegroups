import { describe, expect, it } from "vitest";
import {
  bucketFollowUp,
  canTransitionFollowUpStatus,
  compareFollowUpUrgency,
  followUpCompletionEffect,
  isFollowUpOverdue,
  isShepherdCareFollowUpStatus,
  sortFollowUpsByUrgency,
  summarizeFollowUps,
  type CareFollowUpLike,
} from "@/lib/admin/shepherd-care-follow-ups";

const TODAY = "2026-05-22";
const PAST = "2026-05-10";
const TODAY_DATE = "2026-05-22";
const FUTURE = "2026-06-01";

function fu(status: CareFollowUpLike["status"], due: string | null): CareFollowUpLike {
  return { status, due_date: due };
}

describe("isShepherdCareFollowUpStatus", () => {
  it("accepts the three workflow states and rejects anything else", () => {
    expect(isShepherdCareFollowUpStatus("open")).toBe(true);
    expect(isShepherdCareFollowUpStatus("in_progress")).toBe(true);
    expect(isShepherdCareFollowUpStatus("done")).toBe(true);
    expect(isShepherdCareFollowUpStatus("snoozed")).toBe(false);
    expect(isShepherdCareFollowUpStatus("")).toBe(false);
    expect(isShepherdCareFollowUpStatus(null)).toBe(false);
  });
});

describe("canTransitionFollowUpStatus", () => {
  it("allows any move to a different state", () => {
    expect(canTransitionFollowUpStatus("open", "in_progress")).toBe(true);
    expect(canTransitionFollowUpStatus("open", "done")).toBe(true);
    expect(canTransitionFollowUpStatus("in_progress", "done")).toBe(true);
    expect(canTransitionFollowUpStatus("in_progress", "open")).toBe(true);
    // Reopen from done is legal (and clears completed_at — see below).
    expect(canTransitionFollowUpStatus("done", "open")).toBe(true);
    expect(canTransitionFollowUpStatus("done", "in_progress")).toBe(true);
  });

  it("rejects a same-state no-op transition", () => {
    expect(canTransitionFollowUpStatus("open", "open")).toBe(false);
    expect(canTransitionFollowUpStatus("in_progress", "in_progress")).toBe(false);
    expect(canTransitionFollowUpStatus("done", "done")).toBe(false);
  });
});

describe("followUpCompletionEffect", () => {
  it("sets completed_at when entering done, clears it otherwise", () => {
    expect(followUpCompletionEffect("done")).toBe("set");
    expect(followUpCompletionEffect("open")).toBe("clear");
    expect(followUpCompletionEffect("in_progress")).toBe("clear");
  });
});

describe("isFollowUpOverdue", () => {
  it("is overdue only when a past due date and not done", () => {
    expect(isFollowUpOverdue(fu("open", PAST), TODAY)).toBe(true);
    expect(isFollowUpOverdue(fu("in_progress", PAST), TODAY)).toBe(true);
  });

  it("is not overdue when done, due today, future, or no due date", () => {
    expect(isFollowUpOverdue(fu("done", PAST), TODAY)).toBe(false);
    expect(isFollowUpOverdue(fu("open", TODAY_DATE), TODAY)).toBe(false);
    expect(isFollowUpOverdue(fu("open", FUTURE), TODAY)).toBe(false);
    expect(isFollowUpOverdue(fu("open", null), TODAY)).toBe(false);
  });
});

describe("bucketFollowUp", () => {
  it("buckets by status with overdue taking precedence over open/in_progress", () => {
    expect(bucketFollowUp(fu("done", PAST), TODAY)).toBe("done");
    expect(bucketFollowUp(fu("open", PAST), TODAY)).toBe("overdue");
    expect(bucketFollowUp(fu("in_progress", PAST), TODAY)).toBe("overdue");
    expect(bucketFollowUp(fu("open", FUTURE), TODAY)).toBe("open");
    expect(bucketFollowUp(fu("in_progress", null), TODAY)).toBe("in_progress");
  });
});

describe("summarizeFollowUps", () => {
  it("counts each bucket and rolls outstanding = open + in_progress + overdue", () => {
    const counts = summarizeFollowUps(
      [
        fu("open", FUTURE), // open
        fu("open", PAST), // overdue
        fu("in_progress", null), // in_progress
        fu("in_progress", PAST), // overdue
        fu("done", PAST), // done
      ],
      TODAY,
    );
    expect(counts).toEqual({
      open: 1,
      inProgress: 1,
      overdue: 2,
      done: 1,
      outstanding: 4,
    });
  });
});

describe("sortFollowUpsByUrgency", () => {
  it("orders overdue first (most overdue first), then soonest due, nulls last, done last", () => {
    const a = { id: "a", ...fu("open", "2026-05-15") }; // overdue
    const b = { id: "b", ...fu("open", PAST) }; // more overdue
    const c = { id: "c", ...fu("open", FUTURE) }; // upcoming
    const d = { id: "d", ...fu("in_progress", null) }; // no due date
    const e = { id: "e", ...fu("done", PAST) }; // done sinks
    const ordered = sortFollowUpsByUrgency([c, e, a, d, b], TODAY).map((x) => x.id);
    expect(ordered).toEqual(["b", "a", "c", "d", "e"]);
  });

  it("is stable for equal-urgency rows (preserves incoming order)", () => {
    const first = { id: "first", ...fu("open", PAST) };
    const second = { id: "second", ...fu("open", PAST) };
    const ordered = sortFollowUpsByUrgency([first, second], TODAY).map((x) => x.id);
    expect(ordered).toEqual(["first", "second"]);
  });

  it("does not mutate the input array", () => {
    const input = [{ id: "a", ...fu("open", FUTURE) }, { id: "b", ...fu("open", PAST) }];
    const snapshot = input.map((x) => x.id);
    sortFollowUpsByUrgency(input, TODAY);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});

describe("compareFollowUpUrgency", () => {
  it("returns 0 for two equal-urgency items", () => {
    expect(compareFollowUpUrgency(fu("open", PAST), fu("open", PAST), TODAY)).toBe(0);
  });
});
