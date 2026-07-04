import { describe, expect, it } from "vitest";
import {
  listTabDescription,
  matchesListTab,
  needsAttention,
  needsHealthCheck,
  setupCategory,
  type GroupListTab,
  type GroupTabInput,
  type GroupTriageSignals,
} from "@/lib/dashboard/group-status";

const NO_SIGNALS: GroupTriageSignals = {
  missingRequiredRatings: false,
  hasOpenFollowUp: false,
  hasCareConcern: false,
};

// A healthy, fully set-up, no-concern active group — the baseline that should
// only ever land in "all". `signals` overrides merge onto NO_SIGNALS so each
// test only states the one signal it cares about.
function baseInput(
  overrides: Partial<Omit<GroupTabInput, "signals">> & {
    signals?: Partial<GroupTriageSignals>;
  } = {}
): GroupTabInput {
  const { signals, ...rest } = overrides;
  return {
    lifecycle: "active",
    setup: "complete",
    health: "no_concerns",
    capacity: "open",
    ...rest,
    signals: { ...NO_SIGNALS, ...(signals ?? {}) },
  };
}

describe("setupCategory", () => {
  it("requires an effective capacity for setup to be complete (plan §4)", () => {
    expect(
      setupCategory({
        hasLeader: true,
        meetingDay: "Tuesday",
        meetingTime: "18:30",
        effectiveCapacity: 12,
      })
    ).toBe("complete");
    // Leader + schedule present but no capacity zone → not complete.
    expect(
      setupCategory({
        hasLeader: true,
        meetingDay: "Tuesday",
        meetingTime: "18:30",
        effectiveCapacity: null,
      })
    ).toBe("needs_setup");
  });

  it("still surfaces the named leader / meeting gaps first", () => {
    expect(
      setupCategory({
        hasLeader: false,
        meetingDay: "Tuesday",
        meetingTime: "18:30",
        effectiveCapacity: null,
      })
    ).toBe("needs_leader");
    expect(
      setupCategory({
        hasLeader: true,
        meetingDay: null,
        meetingTime: null,
        effectiveCapacity: null,
      })
    ).toBe("missing_meeting");
  });
});

describe("needsHealthCheck", () => {
  it("includes not-assessed groups", () => {
    expect(needsHealthCheck(baseInput({ health: "not_assessed" }))).toBe(true);
  });

  it("includes groups with a grade letter but missing required ratings", () => {
    // computeGrade can produce a letter from attendance alone; a missing
    // spiritual-growth / group-question rating must keep the group in the queue.
    expect(
      needsHealthCheck(
        baseInput({
          health: "no_concerns",
          signals: { missingRequiredRatings: true },
        })
      )
    ).toBe(true);
  });

  it("excludes fully-assessed groups with all required ratings", () => {
    expect(needsHealthCheck(baseInput({ health: "no_concerns" }))).toBe(false);
  });
});

describe("needsAttention", () => {
  it("includes a health concern", () => {
    expect(needsAttention(baseInput({ health: "needs_attention" }))).toBe(true);
  });

  it("includes a full or near-full capacity even with a good grade", () => {
    expect(needsAttention(baseInput({ capacity: "full" }))).toBe(true);
    expect(needsAttention(baseInput({ capacity: "near_full" }))).toBe(true);
  });

  it("includes an open follow-up concern even with a good grade", () => {
    expect(
      needsAttention(baseInput({ signals: { hasOpenFollowUp: true } }))
    ).toBe(true);
  });

  it("includes a leader/co-leader care concern even with a good grade", () => {
    expect(
      needsAttention(baseInput({ signals: { hasCareConcern: true } }))
    ).toBe(true);
  });

  it("excludes a healthy, open, concern-free group", () => {
    expect(needsAttention(baseInput())).toBe(false);
  });
});

describe("matchesListTab", () => {
  it("scopes every non-archived tab to active groups and routes archived apart", () => {
    const archived = baseInput({ lifecycle: "archived" });
    expect(matchesListTab("archived", archived)).toBe(true);
    expect(matchesListTab("all", archived)).toBe(false);
    expect(matchesListTab("needs_attention", archived)).toBe(false);
    // A non-archived group never appears under Archived.
    expect(matchesListTab("archived", baseInput())).toBe(false);
  });

  it("lists every active group under All Groups", () => {
    expect(matchesListTab("all", baseInput())).toBe(true);
  });

  it("routes by setup / health-check / attention predicates", () => {
    expect(
      matchesListTab("needs_setup", baseInput({ setup: "needs_leader" }))
    ).toBe(true);
    expect(
      matchesListTab(
        "needs_health_check",
        baseInput({ signals: { missingRequiredRatings: true } })
      )
    ).toBe(true);
    expect(
      matchesListTab("needs_attention", baseInput({ capacity: "full" }))
    ).toBe(true);
  });
});

describe("listTabDescription", () => {
  it("describes every tab's membership rule in operator words", () => {
    const tabs: GroupListTab[] = [
      "all",
      "needs_setup",
      "needs_health_check",
      "needs_attention",
      "archived",
    ];
    for (const tab of tabs) {
      expect(listTabDescription(tab).length).toBeGreaterThan(0);
    }
    // The descriptions must name the rule's actual legs so the copy and the
    // predicates above can't drift apart unnoticed.
    expect(listTabDescription("needs_setup")).toContain("shepherd");
    expect(listTabDescription("needs_setup")).toContain("capacity");
    expect(listTabDescription("needs_health_check")).toContain(
      "Group-Health Grade"
    );
    expect(listTabDescription("needs_attention")).toContain("follow-up");
    expect(listTabDescription("needs_attention")).toContain("capacity");
    // Archive is the soft, reversible exit (CONTEXT.md) — the copy says so.
    expect(listTabDescription("archived")).toContain("Restore");
  });
});
