import { beforeEach, describe, expect, it, vi } from "vitest";

// fetchMetricDefaultsCached wraps Next's unstable_cache; stub it to a plain read
// of canned defaults so the single-group read can run under vitest.
vi.mock("@/lib/supabase/cached-config", () => ({
  fetchMetricDefaultsCached: vi.fn(async () => ({
    data: { setting_key: "metric_defaults", setting_value: {} },
    error: null,
  })),
}));

import { getGroupHealthOverviewForGroup } from "@/lib/admin/group-health-read";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const PERIOD = "2026-05-01";
const GROUP_ID = "g-1";

// A chainable query stub that records the table + the column/value of every
// .eq()/.in() filter, so a test can assert what was queried (e.g. that the
// groups read was scoped by id rather than a full scan). Resolves to the rows
// the caller seeded for that table.
type Filter = { method: "eq" | "in"; column: string; value: unknown };

function makeClient(tables: Record<string, unknown[]>) {
  const calls: { table: string; filters: Filter[] }[] = [];

  function query(table: string) {
    const filters: Filter[] = [];
    const record = { table, filters };
    calls.push(record);
    const rows = tables[table] ?? [];

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      not: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ method: "eq", column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push({ method: "in", column, value });
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      returns: () => builder,
      // Awaiting the builder itself resolves the list query.
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  }

  return { client: { from: (table: string) => query(table) }, calls };
}

const BASE_GROUP = {
  id: GROUP_ID,
  name: "Aspen",
  lifecycle_status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getGroupHealthOverviewForGroup", () => {
  it("returns a single graded row for the requested group", async () => {
    const { client } = makeClient({
      groups: [BASE_GROUP],
      app_settings: [], // rubric falls back to built-in defaults
      group_health_assessments: [
        {
          group_id: GROUP_ID,
          attendance_pct: null,
          attendance_weeks_counted: 0,
          spiritual_growth_score: 4,
          spiritual_growth_note: null,
          group_question_score: 3,
          group_question_leader_reported: false,
          computed_letter: null,
          needs_follow_up: false,
          updated_at: "2026-05-02T00:00:00Z",
        },
      ],
      group_health_latest_follow_up: [
        { group_id: GROUP_ID, needs_follow_up: true },
      ],
      attendance_sessions: [],
      attendance_records: [],
    });

    const res = await getGroupHealthOverviewForGroup(
      client as unknown as AppSupabaseClient,
      GROUP_ID,
      PERIOD
    );

    expect(res.error).toBeNull();
    expect(res.data).not.toBeNull();
    expect(res.data?.group_id).toBe(GROUP_ID);
    expect(res.data?.group_name).toBe("Aspen");
    // The cross-month follow-up flag is carried through.
    expect(res.data?.needs_follow_up).toBe(true);
    // Persisted ratings are surfaced for the detail Health tab.
    expect(res.data?.spiritual_growth_score).toBe(4);
    expect(res.data?.group_question_score).toBe(3);
  });

  it("reads only the requested group — never a full groups scan (O(1))", async () => {
    const { client, calls } = makeClient({
      groups: [BASE_GROUP],
      app_settings: [],
      group_health_assessments: [],
      group_health_latest_follow_up: [],
      attendance_sessions: [],
      attendance_records: [],
    });

    await getGroupHealthOverviewForGroup(
      client as unknown as AppSupabaseClient,
      GROUP_ID,
      PERIOD
    );

    const groupReads = calls.filter((c) => c.table === "groups");
    expect(groupReads.length).toBeGreaterThan(0);
    // Every groups read is scoped to this id (fetchGroupsByIds), so the detail
    // route never recomputes every active group just to render one.
    for (const read of groupReads) {
      const idFilter = read.filters.find((f) => f.column === "id");
      expect(idFilter).toBeDefined();
      expect(idFilter?.value).toEqual([GROUP_ID]);
    }
    // The assessment + follow-up reads are scoped to the group too.
    const assessmentRead = calls.find(
      (c) => c.table === "group_health_assessments"
    );
    expect(
      assessmentRead?.filters.some(
        (f) => f.column === "group_id" && f.value === GROUP_ID
      )
    ).toBe(true);
  });

  it("treats a closed group as not assessed without further reads", async () => {
    const { client, calls } = makeClient({
      groups: [{ ...BASE_GROUP, lifecycle_status: "closed" }],
    });

    const res = await getGroupHealthOverviewForGroup(
      client as unknown as AppSupabaseClient,
      GROUP_ID,
      PERIOD
    );

    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
    // Only the groups read happened; no attendance fan-out for a closed group.
    expect(calls.some((c) => c.table === "attendance_sessions")).toBe(false);
  });
});
