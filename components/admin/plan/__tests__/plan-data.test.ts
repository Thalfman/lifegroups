import { describe, expect, it } from "vitest";

import {
  buildPlanData,
  EMPTY_PLAN_DATA,
  type PlanReads,
} from "@/components/admin/plan/plan-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. Two adapters, one seam (ADR 0015): this fake satisfies
// the same `PlanReads` the live `supabasePlanReads` adapter does.
function emptyReads(overrides: Partial<PlanReads> = {}): PlanReads {
  return {
    fetchProspects: async () => ok([]),
    fetchPlanGroupOptions: async () => ok([]),
    fetchDueFollowUps: async () => ok([]),
    ...overrides,
  };
}

const TODAY = { todayIso: "2026-06-09" };

const PROSPECT = {
  id: "p1",
  full_name: "Pat Prospect",
  email: null,
  phone: null,
  state: "interested",
  group_id: null,
  archived: false,
  created_at: "2026-06-01T00:00:00Z",
  next_step: null,
  additional_note: null,
  desired_audience_category: null,
  desired_category_id: null,
} as never;

const GROUPS = [
  { id: "g2", name: "Zed", lifecycle_status: "active" },
  { id: "g1", name: "Alpha", lifecycle_status: "active" },
  // Closed groups resolve roll-up labels but are not Match/Join targets.
  { id: "g3", name: "Closed", lifecycle_status: "closed" },
] as never;

describe("buildPlanData", () => {
  it("composes the board and pickers with no errors when every read succeeds", async () => {
    const calls: string[] = [];
    const data = await buildPlanData(
      emptyReads({
        fetchProspects: async () => ok([PROSPECT]),
        fetchPlanGroupOptions: async () => ok(GROUPS),
        fetchDueFollowUps: async (todayIso) => {
          calls.push(todayIso);
          return ok([]);
        },
      }),
      TODAY
    );

    expect(data.errors).toEqual({
      prospects: null,
      groups: null,
    });
    // The interested column carries the prospect.
    const interested = data.board.columns.find((c) => c.state === "interested");
    expect(interested?.prospects).toHaveLength(1);
    // Open groups only, sorted by name; the closed group keeps its label.
    expect(data.activeGroups).toEqual([
      { id: "g1", name: "Alpha" },
      { id: "g2", name: "Zed" },
    ]);
    expect(data.groupNamesById.g3).toBe("Closed");
    // The due read is filtered in the DB against the provided church-today.
    expect(calls).toEqual(["2026-06-09"]);
  });

  it("degrades the board to empty columns when the prospects read fails, keeping groups", async () => {
    const data = await buildPlanData(
      emptyReads({
        fetchProspects: async () => fail("prospects boom"),
        fetchPlanGroupOptions: async () => ok(GROUPS),
      }),
      TODAY
    );

    expect(data.errors.prospects).toBe("prospects boom");
    // The board keeps its three active columns, each empty — the shell renders
    // the error banner over an empty board, never a false zero presented as
    // live data without its error.
    expect(data.board.columns.map((c) => c.state)).toEqual([
      "interested",
      "matched",
      "not_at_this_time",
    ]);
    expect(data.board.columns.every((c) => c.prospects.length === 0)).toBe(
      true
    );
    expect(data.board.joined).toEqual([]);
    // The later reads still loaded — one failure doesn't blank the surface.
    expect(data.errors.groups).toBeNull();
    expect(data.activeGroups).toHaveLength(2);
  });

  it("folds a due-tasks failure into the prospects key, after the prospects read", async () => {
    const data = await buildPlanData(
      emptyReads({
        fetchProspects: async () => ok([PROSPECT]),
        fetchDueFollowUps: async () => fail("due boom"),
      }),
      TODAY
    );

    expect(data.errors.prospects).toBe("due boom");
    expect(data.dueTasks).toEqual([]);
    // The board itself still populated from the prospects read.
    expect(data.board.columns[0].prospects).toHaveLength(1);
  });

  it("orders the prospects-key precedence as data: prospects before due tasks", async () => {
    const data = await buildPlanData(
      emptyReads({
        fetchProspects: async () => fail("prospects boom"),
        fetchDueFollowUps: async () => fail("due boom"),
      }),
      TODAY
    );

    expect(data.errors.prospects).toBe("prospects boom");
  });

  it("documents the no-database fallback shape", () => {
    expect(EMPTY_PLAN_DATA.board).toEqual({ columns: [], joined: [] });
    expect(EMPTY_PLAN_DATA.activeGroups).toEqual([]);
    expect(EMPTY_PLAN_DATA.errors.prospects).toBe(
      "The database is not configured in this environment."
    );
  });
});
