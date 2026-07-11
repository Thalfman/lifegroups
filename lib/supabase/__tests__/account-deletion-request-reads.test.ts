import { describe, expect, it } from "vitest";

import { fetchPendingAccountDeletionRequests } from "@/lib/supabase/account-deletion-request-reads";
import type { ReadClient } from "@/lib/supabase/read-core";

function makeClient(rows: unknown[], error: { message: string } | null = null) {
  let selectArg = "";
  let statusFilter: unknown[] = [];
  let orderArg: unknown[] = [];
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      selectArg = columns;
      return builder;
    },
    eq: (...args: unknown[]) => {
      statusFilter = args;
      return builder;
    },
    order: (...args: unknown[]) => {
      orderArg = args;
      return builder;
    },
    then: (
      onF: (value: unknown) => unknown,
      onR: (error: unknown) => unknown
    ) => Promise.resolve({ data: error ? null : rows, error }).then(onF, onR),
  };
  return {
    client: { from: () => builder } as unknown as ReadClient,
    select: () => selectArg,
    statusFilter: () => statusFilter,
    order: () => orderArg,
  };
}

const REQUEST = {
  id: "11111111-1111-1111-1111-111111111111",
  profile_id: "22222222-2222-2222-2222-222222222222",
  reason: "Please remove my account",
  status: "pending",
  requested_at: "2026-07-10T12:00:00Z",
  profile: {
    id: "22222222-2222-2222-2222-222222222222",
    full_name: "Avery Shepherd",
    email: "avery@example.com",
  },
};

describe("fetchPendingAccountDeletionRequests", () => {
  it("uses named request/profile columns and the pending oldest-first query", async () => {
    const mock = makeClient([]);
    await fetchPendingAccountDeletionRequests(mock.client);

    expect(mock.select()).not.toContain("*");
    expect(mock.select()).toContain(
      "id, profile_id, reason, status, requested_at"
    );
    expect(mock.select()).toContain("id, full_name, email");
    expect(mock.statusFilter()).toEqual(["status", "pending"]);
    expect(mock.order()).toEqual(["requested_at", { ascending: true }]);
  });

  it("shapes pending requests with the requester identity", async () => {
    const mock = makeClient([REQUEST]);
    const result = await fetchPendingAccountDeletionRequests(mock.client);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: REQUEST.id,
        profileId: REQUEST.profile_id,
        requesterName: "Avery Shepherd",
        requesterEmail: "avery@example.com",
        reason: "Please remove my account",
        status: "pending",
        requestedAt: "2026-07-10T12:00:00Z",
      },
    ]);
  });

  it("returns an empty success only when the query genuinely has no rows", async () => {
    const result = await fetchPendingAccountDeletionRequests(
      makeClient([]).client
    );
    expect(result).toEqual({ data: [], error: null });
  });

  it("preserves query failure instead of reporting an empty queue", async () => {
    const result = await fetchPendingAccountDeletionRequests(
      makeClient([], { message: "temporary outage" }).client
    );
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("temporary outage");
  });

  it("fails closed when a pending request has no requester profile", async () => {
    const result = await fetchPendingAccountDeletionRequests(
      makeClient([{ ...REQUEST, profile: null }]).client
    );
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/requester profile/i);
  });
});
