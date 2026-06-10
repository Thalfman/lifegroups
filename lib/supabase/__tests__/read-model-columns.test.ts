import { describe, expect, it } from "vitest";
import type { ReadClient } from "@/lib/supabase/read-core";
import {
  fetchAllGroups,
  fetchGroupsByIds,
  GROUP_COLUMNS,
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
