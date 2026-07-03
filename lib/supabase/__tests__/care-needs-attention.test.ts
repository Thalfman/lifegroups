import { describe, expect, it } from "vitest";
import {
  computeNeedsAttention,
  type ShepherdCareDirectorySummary,
} from "@/lib/supabase/shepherd-care-directory-reads";

const TODAY = "2026-05-30";
const RECENT = "2026-05-28"; // 2 days ago -> fresh contact, no touchpoint due

function care(
  overrides: Partial<ShepherdCareDirectorySummary> = {}
): ShepherdCareDirectorySummary {
  return {
    id: "care-1",
    shepherd_profile_id: "11111111-1111-1111-1111-111111111111",
    current_status: "doing_well",
    last_contact_at: RECENT,
    next_touchpoint_due: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeNeedsAttention — care status (#122)", () => {
  it("flags concern and needs_follow_up even with fresh contact", () => {
    expect(
      computeNeedsAttention(care({ current_status: "concern" }), TODAY)
    ).toBe(true);
    expect(
      computeNeedsAttention(care({ current_status: "needs_follow_up" }), TODAY)
    ).toBe(true);
  });

  it("does not flag doing_well / needs_encouragement / inactive on status alone", () => {
    expect(
      computeNeedsAttention(care({ current_status: "doing_well" }), TODAY)
    ).toBe(false);
    expect(
      computeNeedsAttention(
        care({ current_status: "needs_encouragement" }),
        TODAY
      )
    ).toBe(false);
    expect(
      computeNeedsAttention(care({ current_status: "inactive" }), TODAY)
    ).toBe(false);
  });

  it("still flags on stale contact regardless of a calm status", () => {
    expect(
      computeNeedsAttention(
        care({ current_status: "doing_well", last_contact_at: "2026-01-01" }),
        TODAY
      )
    ).toBe(true);
  });
});
