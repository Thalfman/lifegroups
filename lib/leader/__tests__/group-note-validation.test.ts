import { describe, expect, it } from "vitest";
import {
  validateLeaderGroupCareNotePayload,
  validateLeaderGroupPrayerRequestPayload,
} from "@/lib/leader/group-note-validation";

const GROUP_ID = "22222222-2222-2222-2222-222222222222";

describe("validateLeaderGroupCareNotePayload", () => {
  it("accepts a valid group id + body and normalizes the uuid", () => {
    const result = validateLeaderGroupCareNotePayload({
      group_id: GROUP_ID.toUpperCase(),
      body: "  Praying through a hard season together.  ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        group_id: GROUP_ID,
        body: "Praying through a hard season together.",
      },
    });
  });

  it("rejects a non-uuid group id", () => {
    const result = validateLeaderGroupCareNotePayload({
      group_id: "not-a-uuid",
      body: "hello",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("group_id must be a uuid");
  });

  it("rejects an empty / whitespace-only body", () => {
    const result = validateLeaderGroupCareNotePayload({
      group_id: GROUP_ID,
      body: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("A care note is required.");
  });

  it("rejects a body over 4000 chars", () => {
    const result = validateLeaderGroupCareNotePayload({
      group_id: GROUP_ID,
      body: "x".repeat(4001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((e) => e.includes("too long"))).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateLeaderGroupCareNotePayload(null).ok).toBe(false);
    expect(validateLeaderGroupCareNotePayload("nope").ok).toBe(false);
  });
});

describe("validateLeaderGroupPrayerRequestPayload", () => {
  it("accepts a valid payload", () => {
    const result = validateLeaderGroupPrayerRequestPayload({
      group_id: GROUP_ID,
      body: "Pray for our launch.",
    });
    expect(result).toEqual({
      ok: true,
      value: { group_id: GROUP_ID, body: "Pray for our launch." },
    });
  });

  it("uses the prayer-request noun in the required error", () => {
    const result = validateLeaderGroupPrayerRequestPayload({
      group_id: GROUP_ID,
      body: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain("A prayer request is required.");
  });
});
