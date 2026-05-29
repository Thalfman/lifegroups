import { describe, expect, it } from "vitest";
import { validateOverShepherdLogInteractionPayload } from "@/lib/over-shepherd/validation";

const SHEP = "22222222-2222-2222-2222-222222222222";
const TODAY = "2026-05-10";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    shepherd_profile_id: SHEP,
    interaction_at: "2026-05-09",
    interaction_type: "call",
    notes: "Caught up after service.",
    ...overrides,
  };
}

describe("validateOverShepherdLogInteractionPayload", () => {
  it("accepts a well-formed broad interaction", () => {
    const r = validateOverShepherdLogInteractionPayload(valid(), { todayIso: TODAY });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(SHEP);
      expect(r.value.interaction_type).toBe("call");
      expect(r.value.notes).toBe("Caught up after service.");
    }
  });

  it("treats blank notes as null (optional)", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({ notes: "   " }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notes).toBeNull();
  });

  it("rejects a non-uuid shepherd id", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({ shepherd_profile_id: "nope" }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a future interaction date (beyond UTC today + 1)", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({ interaction_at: "2026-05-20" }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown interaction type", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({ interaction_type: "carrier_pigeon" }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects notes over 2000 characters", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({ notes: "x".repeat(2001) }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(false);
  });

  // admin-only-field write block: even if a caller hand-crafts a payload with
  // admin_summary / current_status / next_touchpoint_due, the validated value
  // never carries them — they can't reach the narrow RPC, which has no such
  // parameters.
  it("never lets admin-only / follow-up fields through the validated payload", () => {
    const r = validateOverShepherdLogInteractionPayload(
      valid({
        admin_summary: "sensitive private note",
        current_status: "needs_attention",
        set_current_status: "true",
        next_touchpoint_due: "2026-09-01",
        set_next_touchpoint_due: "true",
      }),
      { todayIso: TODAY },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value)).toEqual([
        "shepherd_profile_id",
        "interaction_at",
        "interaction_type",
        "notes",
      ]);
      expect(r.value).not.toHaveProperty("admin_summary");
      expect(r.value).not.toHaveProperty("current_status");
      expect(r.value).not.toHaveProperty("next_touchpoint_due");
    }
  });
});
