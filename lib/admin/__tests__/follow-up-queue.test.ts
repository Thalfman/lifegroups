import { describe, expect, it } from "vitest";
import {
  coerceSavedIdFilter,
  compareFollowUps,
  filterFollowUps,
  followUpDueWindow,
  isFollowUpOverdue,
  isFollowUpsViewSnapshot,
  partitionFollowUpsByStatus,
  type FollowUpQueueFilters,
  type FollowUpQueueItem,
} from "@/lib/admin/follow-up-queue";

// An open, normal-priority, undated, unrelated follow-up; each test overrides
// only the fields under test.
function fu(overrides: Partial<FollowUpQueueItem> = {}): FollowUpQueueItem {
  return {
    status: "open",
    priority: "normal",
    due_date: null,
    created_at: "2026-06-01T00:00:00Z",
    assigned_to: null,
    related_group_id: null,
    related_guest_id: null,
    ...overrides,
  };
}

const noFilters: FollowUpQueueFilters = {
  statusFilter: "all",
  priorityFilter: "all",
  dueFilter: "all",
  assigneeFilter: "all",
  groupFilter: "all",
  guestFilter: "all",
};

// A fixed clock: "now" is mid-afternoon June 11 so the window proves the
// midnight anchor.
const WINDOW = followUpDueWindow(new Date("2026-06-11T15:30:00"));

describe("followUpDueWindow", () => {
  it("anchors today at local midnight and the window end seven days out", () => {
    expect(WINDOW.today.getHours()).toBe(0);
    expect(WINDOW.today.getMinutes()).toBe(0);
    expect(WINDOW.today.getDate()).toBe(11);
    expect(WINDOW.inSevenDays.getDate()).toBe(18);
  });
});

describe("filterFollowUps — status", () => {
  const items = [
    fu({ status: "open" }),
    fu({ status: "in_progress" }),
    fu({ status: "snoozed" }),
    fu({ status: "done" }),
  ];

  it('"active" keeps everything not yet done', () => {
    const kept = filterFollowUps(
      items,
      { ...noFilters, statusFilter: "active" },
      WINDOW
    );
    expect(kept.map((f) => f.status)).toEqual([
      "open",
      "in_progress",
      "snoozed",
    ]);
  });

  it('"all" keeps every status, done included', () => {
    expect(filterFollowUps(items, noFilters, WINDOW)).toHaveLength(4);
  });

  it("a single status narrows to it", () => {
    const kept = filterFollowUps(
      items,
      { ...noFilters, statusFilter: "snoozed" },
      WINDOW
    );
    expect(kept.map((f) => f.status)).toEqual(["snoozed"]);
  });
});

describe("filterFollowUps — due window", () => {
  const items = [
    fu({ due_date: "2026-06-10" }), // yesterday → overdue
    fu({ due_date: "2026-06-11" }), // today → this week, not overdue
    fu({ due_date: "2026-06-18" }), // window end → this week (inclusive)
    fu({ due_date: "2026-06-19" }), // past the window
    fu({ due_date: null }),
  ];

  it('"overdue" keeps only dates strictly before today', () => {
    const kept = filterFollowUps(
      items,
      { ...noFilters, dueFilter: "overdue" },
      WINDOW
    );
    expect(kept.map((f) => f.due_date)).toEqual(["2026-06-10"]);
  });

  it('"this_week" keeps today through seven days out, inclusive', () => {
    const kept = filterFollowUps(
      items,
      { ...noFilters, dueFilter: "this_week" },
      WINDOW
    );
    expect(kept.map((f) => f.due_date)).toEqual(["2026-06-11", "2026-06-18"]);
  });

  it('"no_due_date" keeps only undated items', () => {
    const kept = filterFollowUps(
      items,
      { ...noFilters, dueFilter: "no_due_date" },
      WINDOW
    );
    expect(kept.map((f) => f.due_date)).toEqual([null]);
  });

  it("undated items never match a dated window", () => {
    const kept = filterFollowUps(
      [fu({ due_date: null })],
      { ...noFilters, dueFilter: "overdue" },
      WINDOW
    );
    expect(kept).toHaveLength(0);
  });
});

describe("filterFollowUps — composition", () => {
  it("every criterion must hold (AND across dimensions)", () => {
    const match = fu({
      status: "open",
      priority: "high",
      assigned_to: "p-1",
      related_group_id: "g-1",
      due_date: "2026-06-10",
    });
    const items = [
      match,
      fu({ ...match, priority: "low" }),
      fu({ ...match, assigned_to: "p-2" }),
      fu({ ...match, related_group_id: "g-2" }),
      fu({ ...match, due_date: "2026-06-12" }),
      fu({ ...match, status: "done" }),
    ];
    const kept = filterFollowUps(
      items,
      {
        statusFilter: "active",
        priorityFilter: "high",
        dueFilter: "overdue",
        assigneeFilter: "p-1",
        groupFilter: "g-1",
        guestFilter: "all",
      },
      WINDOW
    );
    expect(kept).toEqual([match]);
  });

  it("an id filter that matches nothing yields an empty queue", () => {
    const kept = filterFollowUps(
      [fu({ related_guest_id: "guest-1" })],
      { ...noFilters, guestFilter: "guest-gone" },
      WINDOW
    );
    expect(kept).toHaveLength(0);
  });
});

describe("partitionFollowUpsByStatus", () => {
  it("buckets by status, keeping empty buckets", () => {
    const grouped = partitionFollowUpsByStatus([
      fu({ status: "done" }),
      fu({ status: "open" }),
    ]);
    expect(grouped.open).toHaveLength(1);
    expect(grouped.in_progress).toHaveLength(0);
    expect(grouped.snoozed).toHaveLength(0);
    expect(grouped.done).toHaveLength(1);
  });

  it("orders each bucket: due date asc, nulls last", () => {
    const grouped = partitionFollowUpsByStatus([
      fu({ due_date: null, created_at: "2026-06-03T00:00:00Z" }),
      fu({ due_date: "2026-06-20" }),
      fu({ due_date: "2026-06-05" }),
    ]);
    expect(grouped.open.map((f) => f.due_date)).toEqual([
      "2026-06-05",
      "2026-06-20",
      null,
    ]);
  });

  it("breaks due-date ties by priority, then created_at desc", () => {
    const grouped = partitionFollowUpsByStatus([
      fu({ priority: "low", created_at: "2026-06-01T00:00:00Z" }),
      fu({ priority: "high", created_at: "2026-06-01T00:00:00Z" }),
      fu({ priority: "high", created_at: "2026-06-02T00:00:00Z" }),
      fu({ priority: "normal", created_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(
      grouped.open.map((f) => `${f.priority}:${f.created_at.slice(8, 10)}`)
    ).toEqual(["high:02", "high:01", "normal:01", "low:01"]);
  });

  it("compareFollowUps treats two undated items by priority", () => {
    expect(
      compareFollowUps(fu({ priority: "low" }), fu({ priority: "high" }))
    ).toBeGreaterThan(0);
  });
});

describe("isFollowUpOverdue", () => {
  it("is true for a dated, not-done follow-up past its due date", () => {
    expect(
      isFollowUpOverdue(fu({ due_date: "2026-06-10" }), WINDOW.today)
    ).toBe(true);
  });

  it("is false on the due date itself", () => {
    expect(
      isFollowUpOverdue(fu({ due_date: "2026-06-11" }), WINDOW.today)
    ).toBe(false);
  });

  it("a done item is never overdue, regardless of date", () => {
    expect(
      isFollowUpOverdue(
        fu({ due_date: "2020-01-01", status: "done" }),
        WINDOW.today
      )
    ).toBe(false);
  });

  it("an undated item is never overdue", () => {
    expect(isFollowUpOverdue(fu(), WINDOW.today)).toBe(false);
  });
});

describe("isFollowUpsViewSnapshot", () => {
  const valid = {
    showFilters: true,
    statusFilter: "active",
    priorityFilter: "all",
    dueFilter: "this_week",
    assigneeFilter: "all",
    groupFilter: "g-1",
    guestFilter: "all",
  };

  it("accepts a current-shape snapshot", () => {
    expect(isFollowUpsViewSnapshot(valid)).toBe(true);
  });

  it("rejects an unknown filter value (stale shape)", () => {
    expect(
      isFollowUpsViewSnapshot({ ...valid, statusFilter: "archived" })
    ).toBe(false);
    expect(isFollowUpsViewSnapshot({ ...valid, dueFilter: "someday" })).toBe(
      false
    );
  });

  it("rejects a missing key and non-objects", () => {
    const { guestFilter: _dropped, ...partial } = valid;
    expect(isFollowUpsViewSnapshot(partial)).toBe(false);
    expect(isFollowUpsViewSnapshot(null)).toBe(false);
    expect(isFollowUpsViewSnapshot("active")).toBe(false);
  });
});

describe("coerceSavedIdFilter", () => {
  const known = new Map([["p-1", {}]]);

  it('passes "all" and known ids through', () => {
    expect(coerceSavedIdFilter("all", known)).toBe("all");
    expect(coerceSavedIdFilter("p-1", known)).toBe("p-1");
  });

  it('coerces a stale id back to "all" so the queue stays clearable', () => {
    expect(coerceSavedIdFilter("p-gone", known)).toBe("all");
  });
});
