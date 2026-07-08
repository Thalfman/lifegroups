import { describe, expect, it } from "vitest";

import { fetchAdminWeeklyCheckInReview } from "@/lib/admin/check-ins";
import type { ReadClient } from "@/lib/supabase/read-core";

// Rows-per-table client stub mirroring the chain shapes the read-model
// fetchers use (`.from(t).select(...)` + filter/order/limit chaining, awaited
// directly or via `.maybeSingle()`).
function makeClient(rowsByTable: Record<string, unknown[]>): ReadClient {
  function makeBuilder(table: string) {
    const rows = rowsByTable[table] ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "order",
      "eq",
      "in",
      "is",
      "not",
      "or",
      "gte",
      "lte",
      "lt",
      "like",
      "limit",
      "range",
      "returns",
    ]) {
      builder[method] = () => builder;
    }
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.then = (
      onFulfilled?: ((value: unknown) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null
    ) =>
      Promise.resolve({ data: rows, error: null }).then(
        onFulfilled,
        onRejected
      );
    return builder;
  }
  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as ReadClient;
}

const ACTIVE_ID = "00000000-0000-4000-8000-000000000001";
const PAUSED_ID = "00000000-0000-4000-8000-000000000002";

function group(id: string, name: string, lifecycle: string) {
  return {
    id,
    name,
    lifecycle_status: lifecycle,
    meeting_day: "Monday",
    meeting_time: "19:00",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    description: null,
    location_area: null,
    address_optional: null,
    capacity: null,
    group_type: null,
    launched_on: null,
  };
}

// Meeting week Mon 2026-06-29; "now" is Sat of that week, days past the
// Monday-evening due point, and no sessions were submitted.
const MEETING_WEEK = "2026-06-29";
const NOW = new Date("2026-07-04T18:00:00Z");

describe("fetchAdminWeeklyCheckInReview — overdue vs lifecycle", () => {
  it("marks only lifecycle-active groups overdue for a missing check-in", async () => {
    const client = makeClient({
      groups: [
        group(ACTIVE_ID, "Active Group", "active"),
        group(PAUSED_ID, "Paused Group", "planned_pause"),
      ],
    });
    const review = await fetchAdminWeeklyCheckInReview(
      client,
      MEETING_WEEK,
      NOW
    );
    const byId = new Map(review.rows.map((r) => [r.groupId, r]));

    const active = byId.get(ACTIVE_ID);
    expect(active?.sessionStatus).toBe("missing");
    expect(active?.isOverdue).toBe(true);

    // A group on a planned pause legitimately submits nothing — its card must
    // not read "Overdue" next to its own pause badge.
    const paused = byId.get(PAUSED_ID);
    expect(paused?.sessionStatus).toBe("missing");
    expect(paused?.isOverdue).toBe(false);
  });
});
