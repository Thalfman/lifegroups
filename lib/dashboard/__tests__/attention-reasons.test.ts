import { describe, expect, it } from "vitest";
import { collectReasonsFor, type DerivedGroupRow } from "@/lib/dashboard/queries";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import type { GroupsRow } from "@/types/database";

// Regression coverage for the dead Shepherd→admin reporting loop removal
// (docs/adr/0002-oversight-ladder-and-leader-gating.md). With the leader
// surface gated, no check-ins are submitted, so the dashboard no longer
// surfaces the "missing_check_in" attention reason — even for a group that
// is scheduled to meet this week and has no attendance session.

const GROUP_ID = "11111111-1111-1111-1111-111111111111";

function baseGroup(overrides: Partial<GroupsRow> = {}): GroupsRow {
  return {
    id: GROUP_ID,
    name: "Test Group",
    description: null,
    meeting_day: "Tuesday",
    meeting_time: "19:00",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: 12,
    lifecycle_status: "active",
    health_status: "healthy",
    audience_category: null,
    life_stage: null,
    launched_on: null,
    pause_reason: null,
    pause_start_date: null,
    expected_return_date: null,
    restart_reminder_date: null,
    admin_notes: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    ...overrides,
  };
}

// A healthy, fully-configured row that yields no attention reasons on its own.
function healthyRow(overrides: Partial<DerivedGroupRow> = {}): DerivedGroupRow {
  return {
    group: baseGroup(),
    override: null,
    activeMemberCount: 5,
    effectiveCapacityValue: 12,
    capacitySource: "group",
    isCapacityUnknown: false,
    isExcluded: false,
    warningPct: 80,
    fullPct: 100,
    capacityStatusValue: "ok",
    utilizationPct: 41.7,
    effectiveHealth: "healthy",
    hasManualHealthOverride: false,
    session: null,
    sessionStatus: "submitted",
    healthUpdate: null,
    followUpNeeded: false,
    leaderNames: ["Sam Shepherd"],
    hasLeader: true,
    hasMeetingDayTime: true,
    hasCapacityConfigured: true,
    followUpsForGroup: [],
    dueLabel: null,
    dueRelative: null,
    isOverdue: false,
    isScheduledThisWeek: true,
    ...overrides,
  };
}

describe("collectReasonsFor — dead reporting loop removed", () => {
  it("does not surface missing_check_in for a scheduled group with no session", () => {
    const row = healthyRow({
      sessionStatus: "no_session",
      session: null,
      isScheduledThisWeek: true,
    });
    const reasons = collectReasonsFor(row);
    expect(reasons).not.toContain("missing_check_in");
    expect(reasons).toEqual([]);
  });

  it("does not surface missing_check_in even when other reasons fire", () => {
    const row = healthyRow({
      sessionStatus: "not_submitted",
      isScheduledThisWeek: true,
      hasLeader: false,
    });
    const reasons = collectReasonsFor(row);
    expect(reasons).not.toContain("missing_check_in");
    // Non-check-in signals are unaffected.
    expect(reasons).toContain("no_leader");
  });

  it("still surfaces live operational reasons (capacity, follow-ups)", () => {
    const row = healthyRow({
      capacityStatusValue: "full",
      followUpsForGroup: [{ id: "x" } as never],
    });
    const reasons = collectReasonsFor(row);
    expect(reasons).toContain("capacity_full");
    expect(reasons).toContain("follow_up_open");
    expect(reasons).not.toContain("missing_check_in");
  });
});

describe("ADMIN_FALLBACK — no retired check-in signal", () => {
  // The dashboard degrades to ADMIN_FALLBACK on an unconfigured client or any
  // query error, and AttentionQueue renders whatever attentionItems it's given
  // (no filter). So the fallback must not seed a missing_check_in card, or a
  // degraded dashboard would re-surface the exact signal collectReasonsFor was
  // changed to drop.
  it("seeds no missing_check_in attention item", () => {
    expect(
      ADMIN_FALLBACK.attentionItems.some((i) => i.reason === "missing_check_in"),
    ).toBe(false);
  });
});
