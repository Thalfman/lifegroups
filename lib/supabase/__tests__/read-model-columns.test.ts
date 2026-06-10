import { describe, expect, it } from "vitest";
import type { ReadClient } from "@/lib/supabase/read-core";
import {
  ATTENDANCE_RECORD_COLUMNS,
  ATTENDANCE_SESSION_COLUMNS,
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupsByIds,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
  fetchProfilesForAdmin,
  GROUP_COLUMNS,
  GROUP_HEALTH_UPDATE_COLUMNS,
  GROUP_LEADER_COLUMNS,
  GROUP_MEMBERSHIP_COLUMNS,
  MEMBER_COLUMNS,
  PROFILE_COLUMNS,
} from "@/lib/supabase/read-models";

// Pins the shared read-model column allowlists (#495), following the shape of
// the session profile pinning test (#492). These fetchers are the high-fan-out
// reads behind the admin surfaces, so they are exactly where a broad
// select("*") would ship every current AND future column of a table to every
// caller by default. Each family below freezes its allowlist to the columns
// the fetcher's row type carries: adding a table column (or widening an
// allowlist) cannot silently widen a read — it has to show up here as a
// deliberate diff.

const UUID_A = "11111111-1111-1111-1111-111111111111";

// Minimal client stub mirroring the chain shapes used by the read-model
// fetchers (`.from(t).select(...)` followed by filter/order/limit/range
// chaining, then awaited directly or via `.maybeSingle()`), capturing the
// argument passed to select() per table so the tests can assert each live
// read uses its allowlist — not just that the exported constant looks right.
type CapturingBuilder = {
  select: (...args: unknown[]) => CapturingBuilder;
  order: () => CapturingBuilder;
  eq: () => CapturingBuilder;
  in: () => CapturingBuilder;
  is: () => CapturingBuilder;
  not: () => CapturingBuilder;
  or: () => CapturingBuilder;
  gte: () => CapturingBuilder;
  lte: () => CapturingBuilder;
  lt: () => CapturingBuilder;
  like: () => CapturingBuilder;
  limit: () => CapturingBuilder;
  range: () => CapturingBuilder;
  returns: () => CapturingBuilder;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (
    onFulfilled?: ((value: { data: never[]; error: null }) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>;
};

function makeSelectCapturingClient(
  selectCalls: Map<string, unknown[]>
): ReadClient {
  function makeBuilder(table: string): CapturingBuilder {
    const builder: CapturingBuilder = {
      select(...args: unknown[]) {
        const calls = selectCalls.get(table) ?? [];
        calls.push(args[0]);
        selectCalls.set(table, calls);
        return builder;
      },
      order: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      or: () => builder,
      gte: () => builder,
      lte: () => builder,
      lt: () => builder,
      like: () => builder,
      limit: () => builder,
      range: () => builder,
      returns: () => builder,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: [] as never[], error: null }).then(
          onFulfilled,
          onRejected
        ),
    };
    return builder;
  }
  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as ReadClient;
}

async function captureSelects(
  run: (client: ReadClient) => Promise<unknown>
): Promise<Map<string, unknown[]>> {
  const selectCalls = new Map<string, unknown[]>();
  await run(makeSelectCapturingClient(selectCalls));
  return selectCalls;
}

// ── groups ───────────────────────────────────────────────────────────────────

const PINNED_GROUP_COLUMNS = [
  "id",
  "name",
  "description",
  "meeting_day",
  "meeting_time",
  "meeting_frequency",
  "meeting_week_parity",
  "location_area",
  "address_optional",
  "capacity",
  "lifecycle_status",
  "health_status",
  "audience_category",
  "category_id",
  "launched_on",
  "pause_reason",
  "pause_start_date",
  "expected_return_date",
  "restart_reminder_date",
  "admin_notes",
  "created_at",
  "updated_at",
  "closed_at",
] as const;

describe("groups read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the groups reads must be a deliberate diff here", () => {
    expect([...GROUP_COLUMNS]).toEqual([...PINNED_GROUP_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(GROUP_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the groups reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllGroups(client);
      await fetchGroupsByIds(client, [UUID_A]);
    });
    expect(calls.get("groups")).toEqual([
      PINNED_GROUP_COLUMNS.join(", "),
      PINNED_GROUP_COLUMNS.join(", "),
    ]);
  });
});

// ── profiles ─────────────────────────────────────────────────────────────────

const PINNED_PROFILE_COLUMNS = [
  "id",
  "auth_user_id",
  "full_name",
  "email",
  "phone",
  "role",
  "status",
  "created_at",
  "updated_at",
] as const;

describe("profiles read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the profiles read must be a deliberate diff here", () => {
    expect([...PROFILE_COLUMNS]).toEqual([...PINNED_PROFILE_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(PROFILE_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the profiles read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchProfilesForAdmin(client);
    });
    expect(calls.get("profiles")).toEqual([PINNED_PROFILE_COLUMNS.join(", ")]);
  });
});

// ── members ──────────────────────────────────────────────────────────────────

const PINNED_MEMBER_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "household_name",
  "status",
  "care_sensitivity_flag",
  "created_at",
  "updated_at",
] as const;

describe("members read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the members reads must be a deliberate diff here", () => {
    expect([...MEMBER_COLUMNS]).toEqual([...PINNED_MEMBER_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(MEMBER_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the members reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllMembers(client);
      await fetchMembersByIds(client, [UUID_A]);
    });
    expect(calls.get("members")).toEqual([
      PINNED_MEMBER_COLUMNS.join(", "),
      PINNED_MEMBER_COLUMNS.join(", "),
    ]);
  });
});

// ── group_leaders ────────────────────────────────────────────────────────────

const PINNED_GROUP_LEADER_COLUMNS = [
  "id",
  "group_id",
  "profile_id",
  "role",
  "assigned_at",
  "active",
  "created_at",
] as const;

describe("group_leaders read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the group-leaders read must be a deliberate diff here", () => {
    expect([...GROUP_LEADER_COLUMNS]).toEqual([...PINNED_GROUP_LEADER_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(GROUP_LEADER_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the group-leaders read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllGroupLeaders(client);
    });
    expect(calls.get("group_leaders")).toEqual([
      PINNED_GROUP_LEADER_COLUMNS.join(", "),
    ]);
  });
});

// ── group_memberships ────────────────────────────────────────────────────────

const PINNED_GROUP_MEMBERSHIP_COLUMNS = [
  "id",
  "group_id",
  "member_id",
  "role",
  "status",
  "joined_at",
  "ended_at",
  "created_at",
] as const;

describe("group_memberships read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the memberships read must be a deliberate diff here", () => {
    expect([...GROUP_MEMBERSHIP_COLUMNS]).toEqual([
      ...PINNED_GROUP_MEMBERSHIP_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_MEMBERSHIP_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the memberships read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchActiveMemberships(client);
    });
    expect(calls.get("group_memberships")).toEqual([
      PINNED_GROUP_MEMBERSHIP_COLUMNS.join(", "),
    ]);
  });
});

// ── attendance_sessions / attendance_records ─────────────────────────────────

const PINNED_ATTENDANCE_SESSION_COLUMNS = [
  "id",
  "group_id",
  "meeting_week",
  "meeting_date",
  "status",
  "submitted_by",
  "submitted_at",
  "leader_note",
  "admin_note",
  "created_at",
  "updated_at",
] as const;

const PINNED_ATTENDANCE_RECORD_COLUMNS = [
  "id",
  "session_id",
  "member_id",
  "attendance_status",
  "created_at",
] as const;

describe("attendance read column allowlists (#495)", () => {
  it("pins the exact allowlists — widening the attendance reads must be a deliberate diff here", () => {
    expect([...ATTENDANCE_SESSION_COLUMNS]).toEqual([
      ...PINNED_ATTENDANCE_SESSION_COLUMNS,
    ]);
    expect([...ATTENDANCE_RECORD_COLUMNS]).toEqual([
      ...PINNED_ATTENDANCE_RECORD_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(ATTENDANCE_SESSION_COLUMNS).not.toContain("*");
    expect(ATTENDANCE_RECORD_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlists to the attendance reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAttendanceSessions(client);
      await fetchAttendanceRecordsForSessions(client, [UUID_A]);
    });
    expect(calls.get("attendance_sessions")).toEqual([
      PINNED_ATTENDANCE_SESSION_COLUMNS.join(", "),
    ]);
    expect(calls.get("attendance_records")).toEqual([
      PINNED_ATTENDANCE_RECORD_COLUMNS.join(", "),
    ]);
  });
});

// ── group_health_updates ─────────────────────────────────────────────────────

const PINNED_GROUP_HEALTH_UPDATE_COLUMNS = [
  "id",
  "group_id",
  "submitted_by",
  "update_week",
  "pulse",
  "follow_up_needed",
  "leader_note",
  "admin_note",
  "created_at",
] as const;

describe("group_health_updates read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the health-updates read must be a deliberate diff here", () => {
    expect([...GROUP_HEALTH_UPDATE_COLUMNS]).toEqual([
      ...PINNED_GROUP_HEALTH_UPDATE_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_HEALTH_UPDATE_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the health-updates read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchLatestHealthUpdates(client);
    });
    expect(calls.get("group_health_updates")).toEqual([
      PINNED_GROUP_HEALTH_UPDATE_COLUMNS.join(", "),
    ]);
  });
});
