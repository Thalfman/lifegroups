import { describe, it, expect } from "vitest";
import {
  detectCareReasons,
  needsAttentionFromReasons,
  ATTENTION_CHIP_REASONS,
  type CareAttentionRow,
} from "@/lib/admin/shepherd-care-attention";

const TODAY = "2026-05-30";
const RECENT = "2026-05-28"; // 2 days ago

function care(overrides: Partial<CareAttentionRow> = {}): CareAttentionRow {
  return {
    current_status: "doing_well",
    last_contact_at: RECENT,
    next_touchpoint_due: null,
    ...overrides,
  };
}

describe("detectCareReasons", () => {
  it("returns no reasons for a fresh, well shepherd", () => {
    expect(
      detectCareReasons(care(), { todayIso: TODAY, staleDays: 60 })
    ).toEqual([]);
  });

  it("treats a missing care row as no_contact_yet", () => {
    expect(detectCareReasons(null, { todayIso: TODAY, staleDays: 60 })).toEqual(
      ["no_contact_yet"]
    );
  });

  it("orders reasons by priority (touchpoint, follow-up, status, staleness, coverage)", () => {
    const reasons = detectCareReasons(
      care({
        current_status: "concern",
        next_touchpoint_due: "2026-05-01",
        last_contact_at: null,
      }),
      {
        todayIso: TODAY,
        staleDays: 60,
        hasOverdueFollowUp: true,
        noOverShepherd: true,
      }
    );
    expect(reasons).toEqual([
      "overdue_touchpoint",
      "overdue_care_follow_up",
      "concern_status",
      "no_contact_yet",
      "no_over_shepherd",
    ]);
  });

  it("suppresses no_over_shepherd unless the caller asks for it", () => {
    expect(
      detectCareReasons(care(), { todayIso: TODAY, staleDays: 60 })
    ).not.toContain("no_over_shepherd");
  });
});

describe("needsAttentionFromReasons — the chip is exactly the chip-subset", () => {
  it("queue-only reasons never flip the chip on their own", () => {
    // overdue_care_follow_up, no_over_shepherd, needs_encouragement are
    // queue-only — present in the triage list but not chip-worthy.
    for (const reason of [
      "overdue_care_follow_up",
      "no_over_shepherd",
      "needs_encouragement_status",
    ] as const) {
      expect(ATTENTION_CHIP_REASONS.has(reason)).toBe(false);
      expect(needsAttentionFromReasons([reason])).toBe(false);
    }
  });

  it("any chip reason flips the chip", () => {
    for (const reason of ATTENTION_CHIP_REASONS) {
      expect(needsAttentionFromReasons([reason])).toBe(true);
    }
  });

  it("needs_encouragement alone does not need attention but is a real reason", () => {
    const reasons = detectCareReasons(
      care({ current_status: "needs_encouragement" }),
      {
        todayIso: TODAY,
        staleDays: 60,
      }
    );
    expect(reasons).toEqual(["needs_encouragement_status"]);
    expect(needsAttentionFromReasons(reasons)).toBe(false);
  });
});
