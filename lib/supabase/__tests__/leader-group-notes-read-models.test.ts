import { describe, expect, it } from "vitest";

import {
  fetchAuthoredGroupCareNotes,
  fetchAuthoredGroupPrayerRequests,
  fetchGroupCareNotes,
  fetchGroupPrayerRequests,
} from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const LEADER = "11111111-1111-1111-1111-111111111111";
const GROUP = "22222222-2222-2222-2222-222222222222";

// Records the filter chain and resolves to fixture rows. Mirrors the thenable
// query-builder mock used across the read-model tests (no DB). Adds `.not()`,
// which the group-note reads use to require a non-null subject_group_id.
function makeClient(rows: unknown[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const notCalls: Array<[string, string, unknown]> = [];
  let lastTable = "";
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    not: (col: string, op: string, val: unknown) => {
      notCalls.push([col, op, val]);
      return builder;
    },
    order: () => builder,
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onF, onR),
  };
  const client = {
    from: (t: string) => {
      lastTable = t;
      return builder;
    },
  } as unknown as AppSupabaseClient;
  return { client, eqCalls, notCalls, table: () => lastTable };
}

const noteRow = {
  id: "33333333-3333-3333-3333-333333333333",
  author_profile_id: LEADER,
  subject_profile_id: null,
  subject_group_id: GROUP,
  body: "Group is in a tender season.",
  created_at: "2026-06-06T00:00:00Z",
  updated_at: "2026-06-06T00:00:00Z",
};

describe("fetchAuthoredGroupCareNotes", () => {
  it("reads care_notes by author and requires a non-null group subject", async () => {
    const { client, eqCalls, notCalls, table } = makeClient([noteRow]);
    const result = await fetchAuthoredGroupCareNotes(client, LEADER);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(table()).toBe("care_notes");
    expect(eqCalls).toContainEqual(["author_profile_id", LEADER]);
    // Only group-subject rows — never the OS-authored, subject-keyed notes.
    expect(notCalls).toContainEqual(["subject_group_id", "is", null]);
  });

  it("short-circuits to empty on a non-uuid author", async () => {
    const { client } = makeClient([noteRow]);
    const result = await fetchAuthoredGroupCareNotes(client, "nope");
    expect(result).toEqual({ data: [], error: null });
  });
});

describe("fetchAuthoredGroupPrayerRequests", () => {
  it("reads prayer_requests by author and requires a non-null group subject", async () => {
    const { client, eqCalls, notCalls, table } = makeClient([
      { ...noteRow, status: "open" },
    ]);
    const result = await fetchAuthoredGroupPrayerRequests(client, LEADER);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(table()).toBe("prayer_requests");
    expect(eqCalls).toContainEqual(["author_profile_id", LEADER]);
    expect(notCalls).toContainEqual(["subject_group_id", "is", null]);
  });
});

describe("fetchGroupCareNotes / fetchGroupPrayerRequests (leader surface)", () => {
  it("reads a group's care notes scoped by subject_group_id", async () => {
    const { client, eqCalls, table } = makeClient([noteRow]);
    const result = await fetchGroupCareNotes(client, GROUP);
    expect(result.error).toBeNull();
    expect(table()).toBe("care_notes");
    expect(eqCalls).toContainEqual(["subject_group_id", GROUP]);
  });

  it("reads a group's prayer requests scoped by subject_group_id", async () => {
    const { client, eqCalls, table } = makeClient([
      { ...noteRow, status: "open" },
    ]);
    const result = await fetchGroupPrayerRequests(client, GROUP);
    expect(result.error).toBeNull();
    expect(table()).toBe("prayer_requests");
    expect(eqCalls).toContainEqual(["subject_group_id", GROUP]);
  });

  it("short-circuits to empty on a non-uuid group id", async () => {
    const { client } = makeClient([noteRow]);
    expect(await fetchGroupCareNotes(client, "nope")).toEqual({
      data: [],
      error: null,
    });
  });
});
