import { describe, expect, it } from "vitest";
import {
  buildAdminGroupModel,
  type AdminGroupModelInput,
} from "@/lib/dashboard/admin-group-model";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import {
  DEMO_CAPACITY_GROUPS,
  DEMO_CAPACITY_MEMBERSHIPS,
  DEMO_CAPACITY_METRIC_SETTINGS,
  DEMO_METRIC_DEFAULTS,
  DEMO_NOW,
  DEMO_SELECTED_WEEK,
} from "@/lib/dashboard/demo-seed";

// ADR-0011 follow-on: the demo capacity rows are no longer hand-built. They are
// the live assembler's output for the demo seed, so the demo and the live
// dashboard derive the capacity-row shape and rules from one place.

const BASE: Omit<AdminGroupModelInput, "defaults"> = {
  groups: DEMO_CAPACITY_GROUPS,
  memberships: DEMO_CAPACITY_MEMBERSHIPS,
  sessions: [],
  healthUpdates: [],
  leaders: [],
  profiles: [],
  metricSettings: DEMO_CAPACITY_METRIC_SETTINGS,
  calendarEvents: [],
  guests: [],
  followUps: [],
  selectedWeek: DEMO_SELECTED_WEEK,
  now: DEMO_NOW,
  activeGroupCount: null,
};

describe("demo capacity seed", () => {
  it("ships exactly the live assembler's capacity summary for the demo seed", () => {
    const model = buildAdminGroupModel({
      ...BASE,
      defaults: DEMO_METRIC_DEFAULTS,
    });
    // One source of truth: the fallback carries the assembler's output verbatim.
    expect(ADMIN_FALLBACK.capacitySummary).toEqual(model.capacitySummary);
  });

  it("carries no hand-set thresholds — every row's warning/full pct is the shared default", () => {
    const rows = [
      ...ADMIN_FALLBACK.capacitySummary.full,
      ...ADMIN_FALLBACK.capacitySummary.warning,
      ...ADMIN_FALLBACK.capacitySummary.ok,
      ...ADMIN_FALLBACK.capacitySummary.unknown,
      ...ADMIN_FALLBACK.capacitySummary.excluded,
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.warningPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_warning_threshold_pct
      );
      expect(row.fullPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_full_threshold_pct
      );
    }
  });

  it("reflects a shared capacity-rule change without editing the fallback module", () => {
    // Lower the warning threshold to 40%: groups previously "ok" now read
    // "warning" purely because the shared metrics rule changed — the demo rows
    // follow the rule, and nothing in lib/dashboard/fallback-data.ts is touched.
    const strict = {
      ...DEMO_METRIC_DEFAULTS,
      capacity_warning_threshold_pct: 40,
    };
    const model = buildAdminGroupModel({ ...BASE, defaults: strict });
    const warningIds = model.capacitySummary.warning.map((r) => r.groupId);
    // Hillside Couples (5/10 = 50%) and Eastside Community (7/12 ≈ 58%) cross
    // the lowered 40% line that the default 80% left them under.
    expect(warningIds).toContain("fb-cap-ok-2");
    expect(warningIds).toContain("fb-cap-ok-1");
    expect(model.capacitySummary.counts.ok).toBe(0);
  });
});
