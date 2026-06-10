import { describe, expect, it } from "vitest";

import {
  buildCheckInDetailData,
  type CheckInDetailReads,
} from "@/lib/admin/check-ins";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const MEETING_WEEK = "2026-06-08";
const SESSION_ID = "00000000-0000-4000-8000-0000000000a1";
const LEADER_PROFILE_ID = "00000000-0000-4000-8000-0000000000b1";

const GROUP = { id: GROUP_ID, name: "Tuesday Night Life Group" };

const SESSION = {
  id: SESSION_ID,
  group_id: GROUP_ID,
  meeting_week: MEETING_WEEK,
  meeting_date: "2026-06-09",
  status: "submitted",
  submitted_by: LEADER_PROFILE_ID,
  submitted_at: "2026-06-09T20:00:00Z",
  leader_note: "Great night.",
};

const MEMBERS = [
  { id: "m-2", full_name: "Blair Member", status: "active" },
  { id: "m-1", full_name: "Avery Member", status: "active" },
  { id: "m-3", full_name: "Casey Former", status: "inactive" },
];

const RECORDS = [
  { session_id: SESSION_ID, member_id: "m-1", attendance_status: "present" },
  { session_id: SESSION_ID, member_id: "m-2", attendance_status: "absent" },
];

// A successful baseline for every read; each test overrides only the reads it
// cares about. This fake satisfies the same `CheckInDetailReads` the live
// `supabaseCheckInDetailReads` adapter does, so the per-section suppression
// rules are exercised with no database.
function detailReads(
  overrides: Partial<CheckInDetailReads> = {}
): CheckInDetailReads {
  return {
    fetchGroupsByIds: async () => ok([GROUP] as never),
    fetchAllGroupLeaders: async () =>
      ok([
        {
          id: "gl-1",
          group_id: GROUP_ID,
          profile_id: LEADER_PROFILE_ID,
          active: true,
        },
      ] as never),
    fetchProfilesForAdmin: async () =>
      ok([{ id: LEADER_PROFILE_ID, full_name: "Avery Leader" }] as never),
    fetchAttendanceSessions: async () => ok([SESSION] as never),
    fetchLatestHealthUpdates: async () =>
      ok([
        { group_id: GROUP_ID, pulse: "healthy", follow_up_needed: false },
      ] as never),
    fetchActiveMemberships: async () =>
      ok([
        { group_id: GROUP_ID, member_id: "m-1", status: "active" },
        { group_id: GROUP_ID, member_id: "m-2", status: "active" },
        { group_id: GROUP_ID, member_id: "m-3", status: "active" },
      ] as never),
    fetchMembersByIds: async () => ok(MEMBERS as never),
    fetchAttendanceRecordsForSessions: async () => ok(RECORDS as never),
    ...overrides,
  };
}

const OPTIONS = { groupId: GROUP_ID, meetingWeek: MEETING_WEEK };

describe("buildCheckInDetailData", () => {
  it("assembles every section when all reads succeed", async () => {
    const result = await buildCheckInDetailData(detailReads(), OPTIONS);

    if (result.kind !== "ok") throw new Error("expected ok");
    const data = result.data;
    expect(data.group).toMatchObject({ id: GROUP_ID });
    expect(data.leaderNames).toEqual(["Avery Leader"]);
    expect(data.sessionStatus).toBe("submitted");
    expect(data.submittedByName).toBe("Avery Leader");
    expect(data.attendance).toEqual({ present: 1, absent: 1, excused: 0 });
    expect(data.health).toMatchObject({ pulse: "healthy" });
    // Roster: active members only, sorted by name, each stamped with its
    // attendance status (null when the leader didn't mark them).
    expect(data.members).toEqual([
      {
        memberId: "m-1",
        fullName: "Avery Member",
        attendanceStatus: "present",
      },
      { memberId: "m-2", fullName: "Blair Member", attendanceStatus: "absent" },
    ]);
    expect(Object.values(data.errors).every((e) => e === null)).toBe(true);
  });

  it("yields the 404 shape when the group read succeeds but finds nothing", async () => {
    expect(
      await buildCheckInDetailData(
        detailReads({ fetchGroupsByIds: async () => ok([]) }),
        OPTIONS
      )
    ).toEqual({ kind: "not_found" });
  });

  it("renders (not 404) when the group read fails, carrying the failure", async () => {
    const result = await buildCheckInDetailData(
      detailReads({ fetchGroupsByIds: async () => fail("group boom") }),
      OPTIONS
    );

    // A transient read failure must never masquerade as "this group does not
    // exist" — the page still renders, with the failure on errors.group.
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.data.group).toBeNull();
    expect(result.data.errors.group).toBe("group boom");
    // Sections fed by their own successful reads survive.
    expect(result.data.sessionStatus).toBe("submitted");
    expect(result.data.members).toHaveLength(2);
  });

  it("suppresses only the roster when the members read fails", async () => {
    const result = await buildCheckInDetailData(
      detailReads({ fetchMembersByIds: async () => fail("members boom") }),
      OPTIONS
    );

    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.data.members).toEqual([]);
    expect(result.data.errors.members).toBe("members boom");
    // The session, its counts, and the leader line render from their own
    // successful reads.
    expect(result.data.sessionStatus).toBe("submitted");
    expect(result.data.attendance).toEqual({
      present: 1,
      absent: 1,
      excused: 0,
    });
    expect(result.data.leaderNames).toEqual(["Avery Leader"]);
  });

  it("suppresses only the session section when the session read fails", async () => {
    const result = await buildCheckInDetailData(
      detailReads({
        fetchAttendanceSessions: async () => fail("session boom"),
      }),
      OPTIONS
    );

    if (result.kind !== "ok") throw new Error("expected ok");
    // No session claim: status degrades to "missing" with the failure on
    // errors.session (the shell shows the error, not a confident "Missing"),
    // and no attendance counts are invented.
    expect(result.data.session).toBeNull();
    expect(result.data.sessionStatus).toBe("missing");
    expect(result.data.attendance).toBeNull();
    expect(result.data.errors.session).toBe("session boom");
    // The roster still renders, un-stamped.
    expect(result.data.members).toEqual([
      { memberId: "m-1", fullName: "Avery Member", attendanceStatus: null },
      { memberId: "m-2", fullName: "Blair Member", attendanceStatus: null },
    ]);
  });

  it("flags a failed records read instead of silently zeroing marks", async () => {
    const result = await buildCheckInDetailData(
      detailReads({
        fetchAttendanceRecordsForSessions: async () => fail("records boom"),
      }),
      OPTIONS
    );

    if (result.kind !== "ok") throw new Error("expected ok");
    // The failure is surfaced on errors.records so the shell can warn that
    // the per-member marks are unavailable rather than authoritative.
    expect(result.data.errors.records).toBe("records boom");
    expect(result.data.members.every((m) => m.attendanceStatus === null)).toBe(
      true
    );
  });
});
