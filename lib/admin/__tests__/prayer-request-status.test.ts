import { describe, expect, it } from "vitest";
import { prayerRequestStatusChipLabel } from "@/lib/admin/prayer-request-status";

// Issue #474 (plan P2.3): the Prayer Request status → chip-label map behind
// the read-only chips on the per-leader Care detail page. The contract the
// acceptance criteria pin: non-open statuses get a label, open gets none.

describe("prayerRequestStatusChipLabel (#474)", () => {
  it("returns null for open — open requests render unchanged, no chip", () => {
    expect(prayerRequestStatusChipLabel("open")).toBeNull();
  });

  it('labels an answered request "Answered"', () => {
    expect(prayerRequestStatusChipLabel("answered")).toBe("Answered");
  });

  it('labels an archived request "Archived"', () => {
    expect(prayerRequestStatusChipLabel("archived")).toBe("Archived");
  });
});
