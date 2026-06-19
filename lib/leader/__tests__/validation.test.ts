import { describe, expect, it } from "vitest";

import {
  validateLeaderCheckinPayload,
  type LeaderCheckinPayload,
} from "@/lib/leader/validation";

// Direct contract tests for the leader weekly check-in validator. The runner
// tests exercise it indirectly through the action pipeline; these pin the
// validator's own contract so a new rule can land (and break) here first.

const GROUP_ID = "11111111-2222-4333-8444-555555555555";
const MEMBER_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MEMBER_B = "99999999-8888-4777-8666-555555555555";

function basePayload(): Record<string, unknown> {
  return {
    group_id: GROUP_ID,
    meeting_week: "2026-06-08",
    meeting_date: "2026-06-10",
    status: "submitted",
    leader_note: "Good night together.",
    pulse: "healthy",
    follow_up_needed: false,
    attendance: [
      { member_id: MEMBER_A, attendance_status: "present" },
      { member_id: MEMBER_B, attendance_status: "absent" },
    ],
  };
}

function expectOk(input: unknown): LeaderCheckinPayload {
  const result = validateLeaderCheckinPayload(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

function expectErrors(input: unknown): string[] {
  const result = validateLeaderCheckinPayload(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return result.errors;
}

describe("validateLeaderCheckinPayload", () => {
  it("accepts a complete submitted check-in", () => {
    const value = expectOk(basePayload());
    expect(value).toEqual({
      group_id: GROUP_ID,
      meeting_week: "2026-06-08",
      meeting_date: "2026-06-10",
      status: "submitted",
      leader_note: "Good night together.",
      pulse: "healthy",
      follow_up_needed: false,
      attendance: [
        { member_id: MEMBER_A, attendance_status: "present" },
        { member_id: MEMBER_B, attendance_status: "absent" },
      ],
    });
  });

  it("rejects a non-record payload", () => {
    expect(expectErrors(null)).toEqual(["The check-in payload was malformed."]);
    expect(expectErrors([])).toEqual(["The check-in payload was malformed."]);
    expect(expectErrors("x")).toEqual(["The check-in payload was malformed."]);
  });

  it("rejects an invalid group id and meeting week", () => {
    const errors = expectErrors({
      ...basePayload(),
      group_id: "not-a-uuid",
      meeting_week: "June 8",
    });
    expect(errors).toContain("The group reference was invalid.");
    expect(errors).toContain("The meeting week was invalid.");
  });

  it("rejects a calendar-impossible meeting week", () => {
    const errors = expectErrors({
      ...basePayload(),
      meeting_week: "2026-13-40",
    });
    expect(errors).toContain("The meeting week was invalid.");
  });

  it("rejects an unknown session status", () => {
    const errors = expectErrors({ ...basePayload(), status: "maybe" });
    expect(errors).toContain(
      "Choose whether the group met, didn't meet, or paused."
    );
  });

  it("accepts each legal session status", () => {
    for (const status of ["submitted", "did_not_meet", "planned_pause"]) {
      const value = expectOk({ ...basePayload(), status });
      expect(value.status).toBe(status);
    }
  });

  it("canonicalizes uuids to lowercase", () => {
    const value = expectOk({
      ...basePayload(),
      group_id: GROUP_ID.toUpperCase(),
      attendance: [
        { member_id: MEMBER_A.toUpperCase(), attendance_status: "present" },
      ],
    });
    expect(value.group_id).toBe(GROUP_ID);
    expect(value.attendance).toEqual([
      { member_id: MEMBER_A, attendance_status: "present" },
    ]);
  });

  it("treats meeting date as optional but rejects malformed values", () => {
    expect(
      expectOk({ ...basePayload(), meeting_date: null }).meeting_date
    ).toBeNull();
    expect(
      expectOk({ ...basePayload(), meeting_date: "" }).meeting_date
    ).toBeNull();
    const errors = expectErrors({ ...basePayload(), meeting_date: "tonight" });
    expect(errors).toContain("The meeting date was invalid.");
  });

  it("treats the health pulse as optional but rejects unknown values", () => {
    expect(expectOk({ ...basePayload(), pulse: null }).pulse).toBeNull();
    expect(expectOk({ ...basePayload(), pulse: "" }).pulse).toBeNull();
    const errors = expectErrors({ ...basePayload(), pulse: "thriving" });
    expect(errors).toContain("That health pulse isn't a valid choice.");
  });

  it("trims the leader note and treats blank as absent", () => {
    expect(
      expectOk({ ...basePayload(), leader_note: "  hi  " }).leader_note
    ).toBe("hi");
    expect(
      expectOk({ ...basePayload(), leader_note: "   " }).leader_note
    ).toBeNull();
    expect(
      expectOk({ ...basePayload(), leader_note: undefined }).leader_note
    ).toBeNull();
  });

  it("rejects a leader note over the max length", () => {
    const errors = expectErrors({
      ...basePayload(),
      leader_note: "x".repeat(1001),
    });
    expect(errors.join(" ")).toContain("shepherd note is too long");
  });

  it("parses follow_up_needed from form-style strings", () => {
    for (const truthy of [true, "true", "on", "1", "yes", " TRUE "]) {
      expect(
        expectOk({ ...basePayload(), follow_up_needed: truthy })
          .follow_up_needed
      ).toBe(true);
    }
    for (const falsy of [false, "false", "off", "0", "", undefined, null]) {
      expect(
        expectOk({ ...basePayload(), follow_up_needed: falsy }).follow_up_needed
      ).toBe(false);
    }
  });

  it("rejects malformed attendance rows but keeps the valid ones", () => {
    const errors = expectErrors({
      ...basePayload(),
      attendance: [
        "not-a-record",
        { member_id: "nope", attendance_status: "present" },
        { member_id: MEMBER_A, attendance_status: "tardy" },
      ],
    });
    expect(errors).toContain("Attendance data was malformed.");
    expect(errors).toContain("One attendance row had an invalid member id.");
    expect(errors).toContain("One attendance row had an invalid status.");
  });

  it("rejects a non-array attendance value", () => {
    const errors = expectErrors({
      ...basePayload(),
      attendance: { member_id: MEMBER_A },
    });
    expect(errors).toContain("Attendance data was malformed.");
  });

  it("de-dupes attendance per member with last entry winning", () => {
    const value = expectOk({
      ...basePayload(),
      attendance: [
        { member_id: MEMBER_A, attendance_status: "present" },
        { member_id: MEMBER_A.toUpperCase(), attendance_status: "excused" },
      ],
    });
    expect(value.attendance).toEqual([
      { member_id: MEMBER_A, attendance_status: "excused" },
    ]);
  });

  it("drops attendance when the group did not meet or paused", () => {
    for (const status of ["did_not_meet", "planned_pause"]) {
      const value = expectOk({ ...basePayload(), status });
      expect(value.attendance).toEqual([]);
    }
  });

  it("treats missing attendance as an empty list", () => {
    const value = expectOk({ ...basePayload(), attendance: undefined });
    expect(value.attendance).toEqual([]);
  });
});
